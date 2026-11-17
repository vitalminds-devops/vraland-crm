"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
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
  floors,
  pipelineStages,
  units,
} from "@/db/schema";
import {
  extraDocumentTypes,
  financingPreferences,
  requiredDocumentLabel,
} from "@/features/contacts/lib/contact-options";
import { formatContactName } from "@/features/contacts/lib/helpers";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import { logError } from "@/lib/logger";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { matchesDeclaredType } from "@/lib/storage/file-signature";
import {
  databaseFailure,
  failure,
  notFoundFailure,
  validationFailure,
  validationFailureFromZod,
} from "@/lib/types/action-result";
import { conflict, permissionDenied } from "@/lib/errors";
import { grantedUnitsCondition } from "@/lib/permissions/property-access";
import type { AuthorizationContext } from "@/lib/permissions/policy";
import { getPropertiesForDevelopment } from "@/features/properties/queries/property-floor-unit.queries";
import { listParkingSlots } from "@/features/properties/queries/parking.queries";
import { opportunityPrice, opportunitySelectionSchema } from "../lib/opportunity-pricing";
import { dealTitleFor } from "../lib/deal-label";
import { isContactsFirstDeal } from "../lib/first-deal";
import { rebuildBill } from "../lib/rebill";
import { openDealForApprovedContact } from "../lib/open-deal";
import { InventoryUnavailable } from "../lib/deal-inventory";
import {
  lockDealForInventory,
  readDealPayments,
  syncBillingInventory,
} from "@/features/billing/lib/billing-inventory";
import { APPOINTMENT_TYPE, VALID_ID_TYPE, documentsOnFile } from "../lib/opportunity-requirements";
import { changeDealStage, type DealActionResult } from "./deal.actions";

const MAX_BYTES = 15 * 1024 * 1024;
// 2 required + 3 extra files at 15 MB stay under the 80 MB server action body limit.
const MAX_EXTRA_FILES = 3;
class OpportunityChanged extends Error {}
const fileTypes: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

async function loadDeal(dealId: string) {
  const context = await requirePermission("deals.change_stage");
  if (!(await canAccessResource(context, { type: "deal", id: dealId }))) return null;
  const [row] = await db
    .select({
      dealId: deals.id,
      stageSlug: pipelineStages.slug,
      unitIds: deals.unitIds,
      amount: deals.amount,
      developmentId: deals.developmentId,
      buildingId: deals.propertyId,
      parkingSlots: deals.parkingSlots,
      parkingSlotIds: deals.parkingSlotIds,
      contactId: contacts.id,
      firstName: contacts.firstName,
      middleName: contacts.middleName,
      lastName: contacts.lastName,
      preferredDevelopmentId: contacts.preferredDevelopmentId,
      preferredUnitIds: contacts.preferredUnitIds,
      firstDeal: isContactsFirstDeal,
      financingPreference: contacts.financingPreference,
      financingPreferenceOther: contacts.financingPreferenceOther,
      bankName: contacts.bankName,
      tinNumber: contacts.tinNumber,
      prcLicenseNumber: contacts.prcLicenseNumber,
    })
    .from(deals)
    .leftJoin(
      dealContacts,
      and(eq(dealContacts.dealId, deals.id), eq(dealContacts.isPrimary, true)),
    )
    .leftJoin(contacts, eq(dealContacts.contactId, contacts.id))
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(and(eq(deals.id, dealId), eq(deals.organizationId, context.organizationId)));
  return row ? { context, row } : null;
}

export type OpportunityDraft = NonNullable<Awaited<ReturnType<typeof getOpportunityDraft>>>;

/** What the Opportunity details dialog starts from: saved values, the developments, and files on record. */
export async function getOpportunityDraft(dealId: string) {
  const loaded = await loadDeal(dealId);
  if (!loaded?.row.contactId) return null;
  const { context, row } = loaded;
  const [developmentRows, onFile] = await Promise.all([
    db
      .select({ id: developments.id, name: developments.name })
      .from(developments)
      .where(eq(developments.organizationId, context.organizationId))
      .orderBy(asc(developments.name)),
    documentsOnFile(db, row.contactId!),
  ]);
  return {
    developments: developmentRows,
    developmentId: row.developmentId ?? (row.firstDeal ? row.preferredDevelopmentId : null) ?? "",
    buildingId: row.buildingId,
    parkingSlots: row.parkingSlots,
    parkingSlotIds: row.parkingSlotIds,
    unitIds: row.unitIds?.length ? row.unitIds : row.firstDeal ? (row.preferredUnitIds ?? []) : [],
    financingPreference: row.financingPreference ?? "",
    financingPreferenceOther: row.financingPreferenceOther ?? "",
    bankName: row.bankName ?? "",
    tinNumber: row.tinNumber ?? "",
    prcLicenseNumber: row.prcLicenseNumber ?? "",
    amount: row.amount ?? "",
    onFile,
  };
}

const detailsSchema = z
  .object({
    dealId: z.uuid(),
    stageId: z.uuid(),
    tinNumber: z.string().trim().min(1, "Enter the client's TIN number.").max(50),
    prcLicenseNumber: z.string().trim().max(50),
    ...opportunitySelectionSchema.shape,
    financingPreference: z.enum(financingPreferences, { error: "Select how it will be paid." }),
    financingPreferenceOther: z.string().trim().max(180),
    bankName: z.string().trim().max(180),
  })
  .superRefine((v, ctx) => {
    if (v.financingPreference === "bank_financing" && !v.bankName)
      ctx.addIssue({ code: "custom", path: ["bankName"], message: "Enter the bank." });
    if (v.financingPreference === "other" && !v.financingPreferenceOther)
      ctx.addIssue({
        code: "custom",
        path: ["financingPreferenceOther"],
        message: "Describe the financing.",
      });
  });

async function estimateSelection(
  context: AuthorizationContext,
  input: z.output<typeof opportunitySelectionSchema>,
  /** When changing an open deal's selection, what it already holds stays selectable. */
  held?: { dealId: string; parkingSlotIds: string[] },
) {
  if (!context.permissions.has("properties.view"))
    return { success: false as const, message: "You cannot select units in this property." };
  const buildings = await getPropertiesForDevelopment(context, input.developmentId);
  const building = buildings.find((row) => row.id === input.buildingId);
  if (!building)
    return {
      success: false as const,
      message: "Select an accessible building in this development.",
    };
  const selected = await db
    .select({ id: units.id })
    .from(units)
    .where(
      and(
        inArray(units.id, input.unitIds),
        eq(units.buildingId, building.id),
        held
          ? or(eq(units.status, "available"), eq(units.reservedDealId, held.dealId))
          : eq(units.status, "available"),
        grantedUnitsCondition(context, {
          propertyId: units.buildingId,
          floorId: units.floorId,
          unitId: units.id,
        }),
      ),
    );
  if (selected.length !== input.unitIds.length)
    return {
      success: false as const,
      message: "Select available units shared with you in this building.",
    };
  if (building.parkingSpaces !== null && input.parkingSlotIds.length > building.parkingSpaces)
    return {
      success: false as const,
      message: `This building has ${building.parkingSpaces} parking spaces. Select fewer slots.`,
    };
  if (input.parkingSlotIds.length) {
    const parking = await listParkingSlots(context, building.id);
    const available = new Set([
      ...parking.filter((slot) => slot.status === "available").map((slot) => slot.id),
      ...(held?.parkingSlotIds ?? []).filter((id) => parking.some((slot) => slot.id === id)),
    ]);
    if (input.parkingSlotIds.some((id) => !available.has(id)))
      return {
        success: false as const,
        message: "Select available parking slots shared with you in this building.",
      };
  }
  const prices = opportunityPrice(
    building.askingPrice,
    selected.length,
    building.parkingPrice,
    input.parkingSlotIds.length,
  );
  if (!prices)
    return {
      success: false as const,
      message:
        "Set the building's gross list price and, when requesting parking, its parking price first.",
    };
  return {
    success: true as const,
    ...prices,
    currency: building.currency,
    buildingTitle: building.title,
    unitPrice: building.askingPrice!,
    parkingPrice: building.parkingPrice,
    parkingSpaces: building.parkingSpaces,
  };
}

export async function getOpportunityEstimate(input: unknown, dealId?: string) {
  const context = await requirePermission("deals.change_stage");
  const parsed = opportunitySelectionSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message ?? "Check the selected units and parking slots.",
    };
  const held = dealId ? (await loadDeal(dealId))?.row : null;
  return estimateSelection(
    context,
    parsed.data,
    held ? { dealId: held.dealId, parkingSlotIds: held.parkingSlotIds } : undefined,
  );
}

export async function getOpportunityParking(input: unknown) {
  const context = await requirePermission("deals.change_stage");
  const parsed = opportunitySelectionSchema
    .pick({ developmentId: true, buildingId: true })
    .safeParse(input);
  if (!parsed.success || !context.permissions.has("properties.view")) return null;
  const { developmentId, buildingId } = parsed.data;
  const buildings = await getPropertiesForDevelopment(context, developmentId);
  if (!buildings.some((building) => building.id === buildingId)) return null;
  const slots = await listParkingSlots(context, buildingId);
  const floorIds = [...new Set(slots.flatMap((slot) => (slot.floorId ? [slot.floorId] : [])))];
  const parkingFloors = floorIds.length
    ? await db
        .select({ id: floors.id, label: floors.label })
        .from(floors)
        .where(and(eq(floors.buildingId, buildingId), inArray(floors.id, floorIds)))
        .orderBy(asc(floors.level))
    : [];
  return { slots, floors: parkingFloors };
}

type CheckedFile = { file: File; body: Buffer; ext: string; checksum: string };

async function checkFile(
  entry: FormDataEntryValue | null,
  label: string,
): Promise<CheckedFile | string | null> {
  if (!(entry instanceof File) || !entry.size) return null;
  if (entry.size > MAX_BYTES) return `${label}: file must be 15 MB or smaller.`;
  const ext = fileTypes[entry.type];
  if (!ext || !(await matchesDeclaredType(entry)))
    return `${label}: only PDF, JPEG and PNG files are accepted.`;
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
  const parsed = detailsSchema.safeParse({
    dealId: formData.get("dealId"),
    stageId: formData.get("stageId"),
    tinNumber: formData.get("tinNumber"),
    prcLicenseNumber: formData.get("prcLicenseNumber") ?? "",
    developmentId: formData.get("developmentId"),
    buildingId: formData.get("buildingId"),
    parkingSlotIds: formData.getAll("parkingSlotIds").map(String),
    unitIds: formData.getAll("unitIds").map(String),
    financingPreference: formData.get("financingPreference"),
    financingPreferenceOther: formData.get("financingPreferenceOther") ?? "",
    bankName: formData.get("bankName") ?? "",
  });
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;

  const loaded = await loadDeal(v.dealId);
  if (!loaded) return notFoundFailure("Opportunity");
  const { context, row } = loaded;
  if (row.stageSlug !== "leads")
    return validationFailure(
      "Only leads can be moved into Opportunity using this form. Refresh the pipeline.",
    );
  if (!row.contactId) return validationFailure("This opportunity has no client.");
  if (!context.permissions.has("contacts.update"))
    return failure(permissionDenied("You cannot update this client's details."));
  const contactId = row.contactId;
  // A lead moved back from Opportunity can still hold its units while it has payments.
  const estimate = await estimateSelection(context, v, {
    dealId: row.dealId,
    parkingSlotIds: row.parkingSlotIds,
  });
  if (!estimate.success) return validationFailure(estimate.message);

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
  try {
    for (const upload of uploads) {
      const key = `${context.organizationId}/contacts/${contactId}/${upload.folder}/${randomUUID()}.${upload.checked.ext}`;
      await storage.put(key, upload.checked.body);
      stored.push(key);
    }
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
      const savedAt = new Date(Math.max(Date.now(), locked.updatedAt.getTime() + 1));
      await tx
        .update(contacts)
        .set({
          tinNumber: v.tinNumber,
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
          propertyId: v.buildingId,
          parkingSlots: v.parkingSlotIds.length,
          parkingSlotIds: v.parkingSlotIds,
          parkingAmount: estimate.parking,
          developmentId: v.developmentId,
          unitId: v.unitIds[0] ?? null,
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
            buildingId: v.buildingId,
            parkingSlots: v.parkingSlotIds.length,
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
    return databaseFailure("The details could not be saved.");
  }
  revalidatePath(`/contacts/${contactId}`);
  return changeDealStage({
    dealId: v.dealId,
    stageId: v.stageId,
    note: "",
    expectedUpdatedAt: savedVersion,
  });
}

const changeSchema = opportunitySelectionSchema.extend({ dealId: z.uuid() });

/**
 * Moves an open opportunity to other units, another tower or another development. The old units
 * and parking go back to Available, the new ones are reserved, and payments stay on the bill,
 * whose lines are rebuilt for the new selection.
 */
export async function changeOpportunityUnits(input: unknown): Promise<DealActionResult> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;
  const loaded = await loadDeal(v.dealId);
  if (!loaded) return notFoundFailure("Opportunity");
  const { context, row } = loaded;
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

      // Rebuild the bill for the new units, keeping its miscellaneous fee rate and payments.
      const [bill] = await tx
        .select({
          id: bills.id,
          unitPrice: bills.unitPrice,
          miscellaneousFee: bills.miscellaneousFee,
          reservationDiscount: bills.reservationDiscount,
        })
        .from(bills)
        .where(eq(bills.dealId, v.dealId))
        .for("update");
      const sameIds = (a: string[], b: string[]) =>
        a.length === b.length && a.every((id) => b.includes(id));
      // Re-saving the same selection keeps any prices billing set by hand.
      const selectionChanged =
        deal.propertyId !== v.buildingId ||
        !sameIds(
          deal.unitIds.length ? deal.unitIds : deal.unitId ? [deal.unitId] : [],
          v.unitIds,
        ) ||
        !sameIds(deal.parkingSlotIds, v.parkingSlotIds);
      if (bill && selectionChanged) {
        const unitCodes = await tx
          .select({ code: units.code })
          .from(units)
          .where(inArray(units.id, v.unitIds))
          .orderBy(asc(units.code));
        const { paid } = await readDealPayments(tx, v.dealId);
        const rebuilt = rebuildBill({
          unitCodes: unitCodes.map((unit) => unit.code),
          place: [estimate.buildingTitle, development.name].filter(Boolean).join(" · "),
          buildingTitle: estimate.buildingTitle,
          unitPrice: estimate.unitPrice,
          parkingSlots: v.parkingSlotIds.length,
          parkingPrice: estimate.parking,
          previous: bill,
          paid,
        });
        if ("error" in rebuilt) return { kind: rebuilt.error, paid };
        await tx
          .update(bills)
          .set({
            unitLabel: rebuilt.unitLabel,
            unitPrice: rebuilt.unitPrice,
            miscellaneousFee: rebuilt.miscellaneousFee,
            updatedBy: context.userId,
            updatedAt: new Date(),
          })
          .where(eq(bills.id, bill.id));
        await tx.delete(billItems).where(eq(billItems.billId, bill.id));
        await tx
          .insert(billItems)
          .values(rebuilt.lines.map((line, position) => ({ billId: bill.id, position, ...line })));
      }

      await tx
        .update(deals)
        .set({
          developmentId: v.developmentId,
          propertyId: v.buildingId,
          unitId: v.unitIds[0] ?? null,
          unitIds: v.unitIds,
          parkingSlots: v.parkingSlotIds.length,
          parkingSlotIds: v.parkingSlotIds,
          parkingAmount: estimate.parking,
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
        propertyId: v.buildingId,
        unitId: v.unitIds[0] ?? null,
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
          buildingId: row.buildingId,
          unitIds: row.unitIds,
          parkingSlotIds: row.parkingSlotIds,
        },
        newValues: {
          developmentId: v.developmentId,
          buildingId: v.buildingId,
          unitIds: v.unitIds,
          parkingSlotIds: v.parkingSlotIds,
          amount: estimate.total,
        },
      });
      return {
        kind: "changed" as const,
        propertyIds: [...propertyIds, ...(row.buildingId ? [row.buildingId] : [])],
      };
    });
    if (outcome.kind === "missing") return notFoundFailure("Opportunity");
    if (outcome.kind === "closed")
      return validationFailure("Won, lost and cancelled opportunities cannot change units.");
    if (outcome.kind === "discount")
      return validationFailure("The bill's reservation discount is more than the new price.");
    if (outcome.kind === "below-paid")
      return validationFailure(
        `The new total is less than the ₱${outcome.paid.toLocaleString("en-PH")} already paid.`,
      );
    revalidatePath("/pipeline");
    revalidatePath(`/deals/${v.dealId}`);
    revalidatePath("/billing");
    revalidatePath(`/billing/${v.dealId}`);
    for (const id of new Set(outcome.propertyIds)) revalidatePath(`/properties/${id}`);
    return { success: true, data: { id: v.dealId } } as DealActionResult;
  } catch (error) {
    if (error instanceof InventoryUnavailable) return failure(conflict(error.message));
    logError("Opportunity unit change failed", error, { operation: "opportunity_change_units" });
    return databaseFailure("The units could not be changed.");
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
      agentId: deals.primaryAgentUserId,
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
  if (!source) return validationFailure("This opportunity has no client.");
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
        primaryAgentUserId: source.agentId,
        dealType: source.dealType === "rent" ? "rent" : "sale",
        another: true,
      }),
    );
    if (!opened.success) return opened as DealActionResult;
    revalidatePath("/pipeline");
    revalidatePath(`/contacts/${source.contactId}`);
    return { success: true, data: { id: opened.data.id } } as DealActionResult;
  } catch (error) {
    logError("Another opportunity failed", error, { operation: "opportunity_add_another" });
    return databaseFailure("The opportunity could not be opened.");
  }
}
