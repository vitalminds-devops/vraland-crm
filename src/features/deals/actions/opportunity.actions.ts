"use server";

import { formatMoney } from "@/lib/utils/money";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  billItems,
  bills,
  contactDocumentRequirements,
  contacts,
  dealContacts,
  deals,
  developments,
  documents,
  pipelineStages,
} from "@/db/schema";
import { extraDocumentTypes, requiredDocumentLabel } from "@/features/contacts/lib/contact-options";
import { formatContactName } from "@/features/contacts/lib/helpers";
import {
  opportunityAddressSchema,
  opportunityInterestSchema,
} from "@/features/contacts/schemas/opportunity-contact.schema";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import { logError } from "@/lib/logger";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { documentFileError, requirementFileTypes } from "@/lib/storage/document-validation";
import {
  databaseFailure,
  failure,
  notFoundFailure,
  validationFailure,
  success,
  validationFailureFromZod,
} from "@/lib/types/action-result";
import { conflict, permissionDenied } from "@/lib/errors";
import { InactiveAssigneeError } from "@/lib/permissions/active-assignees";
import { hasPermission } from "@/lib/permissions/policy";
import { opportunitySelectionSchema } from "../lib/opportunity-pricing";
import { dealTitleFor } from "../lib/deal-label";
import { rebuildBill, selectionChanged } from "../lib/rebill";
import { openDealForApprovedContact } from "../lib/open-deal";
import { InventoryUnavailable } from "../lib/deal-inventory";
import {
  lockDealForInventory,
  readDealPayments,
  syncBillingInventory,
} from "@/features/billing/lib/billing-inventory";
import { APPOINTMENT_TYPE, VALID_ID_TYPE, documentsOnFile } from "../lib/opportunity-requirements";
import type { DealActionResult } from "./deal.actions";
import { applyStageChange } from "../lib/apply-stage-change";
import {
  estimateSelection,
  loadDeal,
  moveRefusal,
  readOpportunityDraft,
  readOpportunityParking,
} from "../queries/opportunity.queries";
import { opportunityChangeSchema, opportunityDetailsSchema } from "../schemas/opportunity.schema";

// 2 required + 3 extra files at 15 MB stay under the 80 MB server action body limit.
const MAX_EXTRA_FILES = 3;
class OpportunityChanged extends Error {}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Selection = { propertyId: string; unitIds: string[]; parkingSlotIds: string[] };

/**
 * Rebuilds the opportunity's bill for a new pick, keeping its miscellaneous fee rate and payments.
 * A bill is left alone when there is none, or the pick is the same (so prices set by hand stay).
 * Returns the refusal when the new bill would be below what is already paid.
 */
async function rebillForSelection(
  tx: Transaction,
  input: {
    dealId: string;
    userId: string;
    estimate: Extract<Awaited<ReturnType<typeof estimateSelection>>, { success: true }>;
    developmentName: string;
    before: {
      propertyId: string | null;
      unitIds: string[];
      parkingSlotIds: string[];
    };
    after: Selection;
  },
): Promise<{ error: "discount" | "below-paid"; paid: number } | null> {
  const [bill] = await tx
    .select({
      id: bills.id,
      itemsTotal: bills.itemsTotal,
      miscellaneousFee: bills.miscellaneousFee,
      reservationDiscount: bills.reservationDiscount,
    })
    .from(bills)
    .where(eq(bills.dealId, input.dealId))
    .for("update");
  if (!bill || !selectionChanged(input.before, input.after)) return null;
  const keep = await tx
    .select({
      unitLabel: billItems.unitLabel,
      unitPrice: billItems.unitPrice,
      miscellaneousFee: billItems.miscellaneousFee,
      unitId: billItems.unitId,
      parkingSlotId: billItems.parkingSlotId,
    })
    .from(billItems)
    .where(eq(billItems.billId, bill.id));
  const { paid } = await readDealPayments(tx, input.dealId);
  const { estimate } = input;
  const rebuilt = rebuildBill({
    units: estimate.selectedUnits,
    place: [estimate.buildingTitle, input.developmentName].filter(Boolean).join(" · "),
    buildingTitle: estimate.buildingTitle,
    slots: estimate.selectedSlots.map((slot) => ({ ...slot, price: slot.price ?? "0" })),
    previous: bill,
    keep,
    paid,
  });
  if ("error" in rebuilt && rebuilt.error) return { error: rebuilt.error, paid };
  await tx
    .update(bills)
    .set({
      itemsLabel: rebuilt.itemsLabel,
      itemsTotal: rebuilt.itemsTotal,
      miscellaneousFee: rebuilt.miscellaneousFee,
      updatedBy: input.userId,
      updatedAt: new Date(),
    })
    .where(eq(bills.id, bill.id));
  await tx.delete(billItems).where(eq(billItems.billId, bill.id));
  await tx
    .insert(billItems)
    .values(rebuilt.lines.map((line, position) => ({ billId: bill.id, position, ...line })));
  return null;
}

export async function getOpportunityDraft(dealId: string) {
  const context = await requirePermission("deals.change_stage");
  return readOpportunityDraft(context, dealId);
}

export async function getOpportunityEstimate(input: unknown, dealId?: string) {
  const context = await requirePermission("deals.change_stage");
  const parsed = opportunitySelectionSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Check the selected units and parking slots.",
    };
  const held = dealId ? await loadDeal(context, dealId) : null;
  return estimateSelection(
    context,
    parsed.data,
    held ? { dealId: held.dealId, parkingSlotIds: held.parkingSlotIds } : undefined,
  );
}

export async function getOpportunityParking(input: unknown, dealId?: string) {
  const context = await requirePermission("deals.change_stage");
  return readOpportunityParking(context, input, dealId);
}

type CheckedFile = { file: File; body: Buffer; ext: string; checksum: string };

async function checkFile(
  entry: FormDataEntryValue | null,
  label: string,
): Promise<CheckedFile | string | null> {
  if (!(entry instanceof File) || !entry.name) return null;
  const error = await documentFileError(entry, requirementFileTypes);
  if (error) return `${label}: ${error}`;
  const ext = requirementFileTypes[entry.type];
  const body = Buffer.from(await entry.arrayBuffer());
  return {
    file: entry,
    body,
    ext,
    checksum: createHash("sha256").update(body).digest("hex"),
  };
}

/**
 * Saves what a lead needs to become an opportunity (development, financing, amount, TIN, valid ID,
 * appointment form, any extra files), then moves it to the Opportunity stage.
 */
export async function openOpportunity(formData: FormData): Promise<DealActionResult> {
  const context = await requirePermission("deals.change_stage");
  const parsed = opportunityDetailsSchema.safeParse({
    ...Object.fromEntries(
      Object.keys(opportunityAddressSchema.shape).map((key) => [key, formData.get(key)]),
    ),
    ...Object.fromEntries(
      Object.keys(opportunityInterestSchema.shape).map((key) => [key, formData.get(key)]),
    ),
    dealId: formData.get("dealId"),
    stageId: formData.get("stageId"),
    tinNumber: formData.get("tinNumber"),
    prcLicenseNumber: formData.get("prcLicenseNumber") ?? "",
    developmentId: formData.get("developmentId"),
    propertyId: formData.get("propertyId"),
    parkingSlotIds: formData.getAll("parkingSlotIds").map(String),
    unitIds: formData.getAll("unitIds").map(String),
    financingPreference: formData.get("financingPreference"),
    financingPreferenceOther: formData.get("financingPreferenceOther") ?? "",
    bankName: formData.get("bankName") ?? "",
  });
  if (!parsed.success)
    return validationFailureFromZod(parsed.error, parsed.error.issues[0]?.message);
  const v = parsed.data;

  const row = await loadDeal(context, v.dealId);
  if (!row) return notFoundFailure("Opportunity");
  if (row.stageSlug !== "leads")
    return validationFailure(
      "Only leads can be moved into Opportunity using this form. Refresh the pipeline.",
    );
  if (!row.contactId) return validationFailure("This opportunity has no contact.");
  if (!context.permissions.has("contacts.update"))
    return failure(
      permissionDenied(
        "You do not have permission to update this contact's details. Ask your administrator for access before moving this lead.",
      ),
    );
  const contactId = row.contactId;
  // Units this opportunity already holds stay selectable for it (say, reopened from Lost).
  const estimate = await estimateSelection(context, v, {
    dealId: row.dealId,
    parkingSlotIds: row.parkingSlotIds,
  });
  if (!estimate.success) return validationFailure(estimate.message);
  // Refused before anything is saved, so a lead never keeps units for a move it can't make.
  const refusal = await moveRefusal(context, v.dealId, v.stageId);
  if (refusal) return validationFailure(refusal);

  const onFile = await documentsOnFile(db, contactId);
  const checks = await Promise.all([
    checkFile(formData.get("validId"), requiredDocumentLabel(VALID_ID_TYPE)),
    checkFile(formData.get("appointmentForm"), requiredDocumentLabel(APPOINTMENT_TYPE)),
    ...formData.getAll("additional").map((entry) => checkFile(entry, "Other document")),
  ]);
  const problem = checks.find((checked) => typeof checked === "string");
  if (problem) return validationFailure(problem);
  const files = checks as (CheckedFile | null)[];
  const [validId, appointment] = files;
  // Each extra file is paired, in order, with the requirement type picked for it.
  const extraTypes = formData.getAll("additionalType").map(String);
  const allowedTypes = new Set<string>(extraDocumentTypes.map((item) => item.documentType));
  const extras = files.slice(2).map((checked, index) => ({ checked, type: extraTypes[index] }));
  if (extras.some((extra) => !allowedTypes.has(extra.type)))
    return validationFailure("Choose a type for each other document.");
  const extraFiles = extras.filter(
    (extra): extra is { checked: CheckedFile; type: string } => extra.checked !== null,
  );
  if (!validId && !onFile.validId)
    return validationFailure(`Upload the ${requiredDocumentLabel(VALID_ID_TYPE).toLowerCase()}.`);
  if (!appointment && !onFile.appointmentForm)
    return validationFailure(
      `Upload the ${requiredDocumentLabel(APPOINTMENT_TYPE).toLowerCase()}.`,
    );
  if (extraFiles.length > MAX_EXTRA_FILES)
    return validationFailure(`Attach at most ${MAX_EXTRA_FILES} other documents.`);

  const [development] = await db
    .select({ name: developments.name })
    .from(developments)
    .where(
      and(
        eq(developments.id, v.developmentId),
        eq(developments.organizationId, context.organizationId),
      ),
    );
  if (!development) return validationFailure("Select a development.");

  const uploads = [
    validId && {
      checked: validId,
      folder: "valid-id",
      name: requiredDocumentLabel(VALID_ID_TYPE),
      category: "id",
      documentType: VALID_ID_TYPE,
      isSensitive: true,
    },
    appointment && {
      checked: appointment,
      folder: "appointment",
      name: requiredDocumentLabel(APPOINTMENT_TYPE),
      category: "contract",
      documentType: APPOINTMENT_TYPE,
      isSensitive: false,
    },
    ...extraFiles.map(({ checked, type }) => ({
      checked,
      folder: "additional",
      name: requiredDocumentLabel(type),
      category: "other",
      documentType: type,
      // Income, tax and bank records are personal.
      isSensitive: true,
    })),
  ].filter((upload) => Boolean(upload)) as {
    checked: CheckedFile;
    folder: string;
    name: string;
    category: string;
    documentType: string;
    isSensitive: boolean;
  }[];

  const storage = getDocumentStorage();
  const stored: string[] = [];
  let savedVersion: string | undefined;
  let uploadsComplete = false;
  try {
    for (const upload of uploads) {
      const key = `${context.organizationId}/contacts/${contactId}/${upload.folder}/${randomUUID()}.${upload.checked.ext}`;
      await storage.put(key, upload.checked.body);
      stored.push(key);
    }
    uploadsComplete = true;
    savedVersion = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ stageSlug: pipelineStages.slug, updatedAt: deals.updatedAt })
        .from(deals)
        .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
        .where(and(eq(deals.id, v.dealId), eq(deals.organizationId, context.organizationId)))
        .limit(1)
        .for("update", { of: deals });
      if (!locked || locked.stageSlug !== "leads")
        throw new OpportunityChanged(
          "This lead has already moved. Refresh the pipeline before changing its selection.",
        );
      // Archived meanwhile (say, from another tab): its lead is hidden and must not get units.
      const [contact] = await tx
        .select({ deletedAt: contacts.deletedAt })
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .for("update");
      if (!contact || contact.deletedAt)
        throw new OpportunityChanged("This contact was archived. Refresh the pipeline.");
      const savedAt = new Date(Math.max(Date.now(), locked.updatedAt.getTime() + 1));
      // A lead that was an opportunity before may still have its bill: it follows the new pick.
      const rebilled = await rebillForSelection(tx, {
        dealId: v.dealId,
        userId: context.userId,
        estimate,
        developmentName: development.name,
        before: {
          propertyId: row.propertyId,
          unitIds: row.unitIds ?? [],
          parkingSlotIds: row.parkingSlotIds ?? [],
        },
        after: v,
      });
      if (rebilled)
        throw new OpportunityChanged(
          rebilled.error === "discount"
            ? "The bill's reservation discount is more than the new price."
            : `The new total is less than the ${formatMoney(rebilled.paid)} already paid.`,
        );
      await tx
        .update(contacts)
        .set({
          tinNumber: v.tinNumber,
          ...opportunityAddressSchema.parse(v),
          budgetMin: v.budgetMin === null ? null : String(v.budgetMin),
          budgetMax: v.budgetMax === null ? null : String(v.budgetMax),
          purchaseType: v.purchaseType,
          employmentType: v.employmentType,
          annualIncome: v.annualIncome === null ? null : String(v.annualIncome),
          prcLicenseNumber: v.prcLicenseNumber || null,
          ...(row.firstDeal
            ? { preferredDevelopmentId: v.developmentId, preferredUnitIds: v.unitIds }
            : {}),
          financingPreference: v.financingPreference,
          financingPreferenceOther:
            v.financingPreference === "other" ? v.financingPreferenceOther : null,
          bankName: v.financingPreference === "bank_financing" ? v.bankName : null,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, contactId));
      await tx
        .update(deals)
        .set({
          amount: estimate.total,
          currency: estimate.currency,
          propertyId: v.propertyId,
          parkingSlotCount: v.parkingSlotIds.length,
          parkingSlotIds: v.parkingSlotIds,
          parkingAmount: estimate.parking,
          reservationFee: estimate.reservationFee,
          parkingReservationFee: estimate.parkingReservationFee,
          monthlyAmortization: estimate.monthlyAmortization,
          parkingMonthlyAmortization: estimate.parkingMonthlyAmortization,
          developmentId: v.developmentId,
          unitIds: v.unitIds,
          title: dealTitleFor(
            formatContactName({
              firstName: row.firstName ?? "",
              middleName: row.middleName,
              lastName: row.lastName ?? "",
            }),
            development.name,
          ),
          updatedBy: context.userId,
          updatedAt: savedAt,
        })
        .where(eq(deals.id, v.dealId));
      for (const [index, upload] of uploads.entries()) {
        const [doc] = await tx
          .insert(documents)
          .values({
            organizationId: context.organizationId,
            contactId,
            dealId: v.dealId,
            name: upload.name,
            category: upload.category,
            documentType: upload.documentType,
            isSensitive: upload.isSensitive,
            status: "draft",
            storageKey: stored[index],
            mimeType: upload.checked.file.type,
            fileSizeBytes: upload.checked.file.size,
            checksumSha256: upload.checked.checksum,
            createdBy: context.userId,
          })
          .returning({ id: documents.id });
        if (upload.documentType !== "general")
          await tx
            .update(contactDocumentRequirements)
            .set({
              documentId: doc.id,
              status: "submitted",
              satisfiedAt: new Date(),
              satisfiedBy: context.userId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(contactDocumentRequirements.contactId, contactId),
                eq(contactDocumentRequirements.organizationId, context.organizationId),
                eq(contactDocumentRequirements.documentType, upload.documentType),
                isNull(contactDocumentRequirements.documentId),
              ),
            );
      }
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "deal",
        entityId: v.dealId,
        newValues: {
          opportunityDetails: {
            developmentId: v.developmentId,
            unitIds: v.unitIds,
            financingPreference: v.financingPreference,
            amount: estimate.total,
            propertyId: v.propertyId,
            parkingSlotCount: v.parkingSlotIds.length,
            parkingSlotIds: v.parkingSlotIds,
            parkingAmount: estimate.parking,
            documents: uploads.map((upload) => upload.name),
          },
        },
      });
      return savedAt.toISOString();
    });
  } catch (error) {
    await Promise.all(stored.map((key) => storage.remove(key).catch(() => undefined)));
    if (error instanceof OpportunityChanged) return failure(conflict(error.message));
    logError("Opportunity details save failed", error, { operation: "opportunity_details" });
    return databaseFailure(
      uploadsComplete
        ? "Couldn't move the lead to Opportunity because its details couldn't be saved. Try again."
        : "Couldn't upload the documents. The lead has not moved to Opportunity. Try again.",
    );
  }
  revalidatePath(`/contacts/${contactId}`);
  const result = await applyStageChange(context, {
    dealId: v.dealId,
    stageId: v.stageId,
    note: "",
    expectedUpdatedAt: savedVersion,
  });
  if (!result.success)
    return {
      ...result,
      error: {
        ...result.error,
        message: `Details and documents saved, but the lead was not moved to Opportunity. ${result.error.message}`,
      },
    };
  return {
    ...result,
    data: {
      ...result.data,
      message: result.data.approvalRequested
        ? "A manager must approve this move. The lead will stay in Leads until then."
        : "Selected units and parking slots remain available to others until Reservation.",
    },
  };
}

/**
 * Moves an open opportunity to other units, another tower or another development. The old units
 * and parking go back to Available, the new ones follow payment status, and payments stay on the bill,
 * whose lines are rebuilt for the new selection.
 */
export async function changeOpportunityUnits(input: unknown): Promise<DealActionResult> {
  const context = await requirePermission("deals.change_stage");
  const parsed = opportunityChangeSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;
  const row = await loadDeal(context, v.dealId);
  if (!row) return notFoundFailure("Opportunity");
  // Changing units changes what is sold and re-totals the bill, so it is an edit, not a stage move.
  if (!hasPermission(context, "deals.update")) return failure(permissionDenied());
  if (row.stageSlug === "leads")
    return validationFailure("Pick a lead's units when moving it to Opportunity.");
  const estimate = await estimateSelection(context, v, {
    dealId: row.dealId,
    parkingSlotIds: row.parkingSlotIds,
  });
  if (!estimate.success) return validationFailure(estimate.message);
  const [development] = await db
    .select({ name: developments.name })
    .from(developments)
    .where(
      and(
        eq(developments.id, v.developmentId),
        eq(developments.organizationId, context.organizationId),
      ),
    );
  if (!development) return validationFailure("Select a development.");

  try {
    const outcome = await db.transaction(async (tx) => {
      const deal = await lockDealForInventory(tx, context.organizationId, v.dealId);
      if (!deal) return { kind: "missing" as const };
      if (deal.isWonStage || deal.isLostStage || deal.isCancelledStage)
        return { kind: "closed" as const };
      // Moved back to Leads since the window opened: a lead holds no units.
      if (deal.slug === "leads") return { kind: "lead" as const };
      if (!selectionChanged(deal, v)) return { kind: "unchanged" as const };

      const rebilled = await rebillForSelection(tx, {
        dealId: v.dealId,
        userId: context.userId,
        estimate,
        developmentName: development.name,
        before: deal,
        after: v,
      });
      if (rebilled) return { kind: rebilled.error, paid: rebilled.paid };

      await tx
        .update(deals)
        .set({
          developmentId: v.developmentId,
          propertyId: v.propertyId,
          unitIds: v.unitIds,
          parkingSlotCount: v.parkingSlotIds.length,
          parkingSlotIds: v.parkingSlotIds,
          parkingAmount: estimate.parking,
          reservationFee: estimate.reservationFee,
          parkingReservationFee: estimate.parkingReservationFee,
          monthlyAmortization: estimate.monthlyAmortization,
          parkingMonthlyAmortization: estimate.parkingMonthlyAmortization,
          amount: estimate.total,
          currency: estimate.currency,
          title: dealTitleFor(
            formatContactName({
              firstName: row.firstName ?? "",
              middleName: row.middleName,
              lastName: row.lastName ?? "",
            }),
            development.name,
          ),
          updatedBy: context.userId,
          updatedAt: new Date(),
        })
        .where(eq(deals.id, v.dealId));
      const propertyIds = await syncBillingInventory(tx, context, {
        ...deal,
        propertyId: v.propertyId,
        unitIds: v.unitIds,
        parkingSlotIds: v.parkingSlotIds,
      });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "deal.units_changed",
        summary: `Units changed to ${estimate.buildingTitle} · ${development.name}.`,
        dealId: v.dealId,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "deal",
        entityId: v.dealId,
        oldValues: {
          developmentId: row.developmentId,
          propertyId: row.propertyId,
          unitIds: row.unitIds,
          parkingSlotIds: row.parkingSlotIds,
        },
        newValues: {
          developmentId: v.developmentId,
          propertyId: v.propertyId,
          unitIds: v.unitIds,
          parkingSlotIds: v.parkingSlotIds,
          amount: estimate.total,
        },
      });
      return {
        kind: "changed" as const,
        propertyIds: [...propertyIds, ...(row.propertyId ? [row.propertyId] : [])],
      };
    });
    if (outcome.kind === "missing") return notFoundFailure("Opportunity");
    if (outcome.kind === "lead")
      return validationFailure("This is a lead now. Pick its units with Move to Opportunity.");
    if (outcome.kind === "unchanged") return success({ id: v.dealId });
    if (outcome.kind === "closed")
      return validationFailure("Won, lost and cancelled opportunities cannot change units.");
    if (outcome.kind === "discount")
      return validationFailure("The bill's reservation discount is more than the new price.");
    if (outcome.kind === "below-paid")
      return validationFailure(
        `The new total is less than the ${formatMoney(outcome.paid)} already paid.`,
      );
    revalidatePath("/pipeline");
    revalidatePath(`/deals/${v.dealId}`);
    revalidatePath("/billing");
    revalidatePath(`/billing/${v.dealId}`);
    for (const id of new Set(outcome.propertyIds)) revalidatePath(`/properties/${id}`);
    return success({ id: v.dealId });
  } catch (error) {
    if (error instanceof InventoryUnavailable) return failure(conflict(error.message));
    logError("Opportunity unit change failed", error, { operation: "opportunity_change_units" });
    return databaseFailure("Couldn't change the units.");
  }
}

/** Opens another opportunity for the same client, for a unit in another tower or development. */
export async function addOpportunityForContact(dealId: string): Promise<DealActionResult> {
  const context = await requirePermission("deals.create");
  if (
    !z.uuid().safeParse(dealId).success ||
    !(await canAccessResource(context, { type: "deal", id: dealId }))
  )
    return notFoundFailure("Opportunity");
  const [source] = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      middleName: contacts.middleName,
      lastName: contacts.lastName,
      agentUserId: deals.agentUserId,
      dealType: deals.dealType,
      stageSlug: pipelineStages.slug,
    })
    .from(deals)
    .innerJoin(
      dealContacts,
      and(eq(dealContacts.dealId, deals.id), eq(dealContacts.isPrimary, true)),
    )
    .innerJoin(contacts, eq(dealContacts.contactId, contacts.id))
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(and(eq(deals.id, dealId), eq(deals.organizationId, context.organizationId)))
    .limit(1);
  if (!source) return validationFailure("This opportunity has no contact.");
  if (source.stageSlug === "leads")
    return validationFailure("Move this lead to Opportunity first.");
  try {
    const opened = await db.transaction((tx) =>
      openDealForApprovedContact(tx, context, {
        contactId: source.contactId,
        contactName: formatContactName({
          firstName: source.firstName ?? "",
          middleName: source.middleName,
          lastName: source.lastName ?? "",
        }),
        agentUserId: source.agentUserId,
        dealType: source.dealType === "rent" ? "rent" : "sale",
        another: true,
      }),
    );
    if (!opened.success) return opened;
    revalidatePath("/pipeline");
    revalidatePath(`/contacts/${source.contactId}`);
    return success({ id: opened.data.id });
  } catch (error) {
    if (error instanceof InactiveAssigneeError) return validationFailure(error.message);
    logError("Another opportunity failed", error, { operation: "opportunity_add_another" });
    return databaseFailure("Couldn't open the opportunity.");
  }
}
