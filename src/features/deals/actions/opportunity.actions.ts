"use server";

import { formatMoney } from "@/lib/utils/money";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
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
  unitTypes,
  units,
} from "@/db/schema";
import {
  extraDocumentTypes,
  financingPreferences,
  requiredDocumentLabel,
} from "@/features/contacts/lib/contact-options";
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
  validationFailureFromZod,
} from "@/lib/types/action-result";
import { conflict, permissionDenied } from "@/lib/errors";
import { grantedUnitsCondition } from "@/lib/permissions/property-access";
import { InactiveAssigneeError } from "@/lib/permissions/active-assignees";
import { hasPermission, type AuthorizationContext } from "@/lib/permissions/policy";
import { getPropertiesForDevelopment } from "@/features/properties/queries/property-floor-unit.queries";
import { listParkingSlots } from "@/features/properties/queries/parking.queries";
import {
  isSlotFreeFor,
  missingFeeWarning,
  opportunityFees,
  opportunityPrice,
  opportunitySelectionSchema,
} from "../lib/opportunity-pricing";
import { dealTitleFor } from "../lib/deal-label";
import { isContactsFirstDeal } from "../lib/first-deal";
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
import { canMoveStage, resolveMoveRole } from "../lib/stage-transitions";

// 2 required + 3 extra files at 15 MB stay under the 80 MB server action body limit.
const MAX_EXTRA_FILES = 3;
class OpportunityChanged extends Error {}

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
      propertyId: deals.propertyId,
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
      currentProvince: contacts.currentProvince,
      currentCity: contacts.currentCity,
      currentBarangay: contacts.currentBarangay,
      currentAddressLine1: contacts.currentAddressLine1,
      currentPostalCode: contacts.currentPostalCode,
      currentCountry: contacts.currentCountry,
      budgetMin: contacts.budgetMin,
      budgetMax: contacts.budgetMax,
      purchaseType: contacts.purchaseType,
      employmentType: contacts.employmentType,
      annualIncome: contacts.annualIncome,
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

/**
 * Why this user's role rules (own opportunities, moving back, viewers) would refuse the move, or
 * null. Checked before Move to Opportunity saves anything; the move itself checks again. A move
 * that only waits for approval is not refused: the details are saved for the approver.
 */
async function moveRefusal(
  context: AuthorizationContext,
  dealId: string,
  stageId: string,
): Promise<string | null> {
  const [deal] = await db
    .select({
      stageId: deals.stageId,
      agentUserId: deals.agentUserId,
      brokerUserId: deals.brokerUserId,
    })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.organizationId, context.organizationId)))
    .limit(1);
  if (!deal) return null;
  const stages = await db
    .select({
      id: pipelineStages.id,
      position: pipelineStages.position,
      isWonStage: pipelineStages.isWonStage,
      isLostStage: pipelineStages.isLostStage,
      isCancelledStage: pipelineStages.isCancelledStage,
      slug: pipelineStages.slug,
    })
    .from(pipelineStages)
    .where(
      and(
        eq(pipelineStages.organizationId, context.organizationId),
        inArray(pipelineStages.id, [deal.stageId, stageId]),
      ),
    );
  const fromStage = stages.find((stage) => stage.id === deal.stageId);
  const toStage = stages.find((stage) => stage.id === stageId);
  if (!fromStage || !toStage) return null;
  const check = canMoveStage({
    userId: context.userId,
    role: resolveMoveRole(context),
    deal,
    fromStage,
    toStage,
    canMoveBack: context.permissions.has("deals.move_back"),
    payments: {},
  });
  return check.allowed ? null : check.message;
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
    draftKey: `${context.organizationId}:${context.userId}:${row.dealId}`,
    developmentId: row.developmentId ?? (row.firstDeal ? row.preferredDevelopmentId : null) ?? "",
    propertyId: row.propertyId,
    parkingSlotIds: row.parkingSlotIds,
    unitIds: row.unitIds?.length ? row.unitIds : row.firstDeal ? (row.preferredUnitIds ?? []) : [],
    financingPreference: row.financingPreference ?? "",
    financingPreferenceOther: row.financingPreferenceOther ?? "",
    bankName: row.bankName ?? "",
    tinNumber: row.tinNumber ?? "",
    prcLicenseNumber: row.prcLicenseNumber ?? "",
    amount: row.amount ?? "",
    address: z.object(opportunityAddressSchema.shape).parse(row),
    interest: z.object(opportunityInterestSchema.shape).parse(row),
    onFile,
  };
}

const detailsSchema = z
  .object({
    ...opportunityAddressSchema.shape,
    ...opportunityInterestSchema.shape,
    dealId: z.uuid({
      error: "Couldn't identify this lead. Refresh the pipeline and try again.",
    }),
    stageId: z.uuid({
      error: "Couldn't identify the Opportunity stage. Refresh the pipeline and try again.",
    }),
    tinNumber: z
      .string()
      .trim()
      .min(1, "Enter the contact's TIN.")
      .max(50, "TIN number must be 50 characters or fewer."),
    prcLicenseNumber: z
      .string()
      .trim()
      .max(50, "PRC license number must be 50 characters or fewer."),
    ...opportunitySelectionSchema.shape,
    financingPreference: z.enum(financingPreferences, { error: "Select how it will be paid." }),
    financingPreferenceOther: z
      .string()
      .trim()
      .max(180, "Other financing must be 180 characters or fewer."),
    bankName: z.string().trim().max(180, "Bank name must be 180 characters or fewer."),
  })
  .superRefine((v, ctx) => {
    for (const schema of [opportunityAddressSchema, opportunityInterestSchema]) {
      const checked = schema.safeParse(v);
      if (!checked.success)
        for (const issue of checked.error.issues)
          ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
    if (v.financingPreference === "bank_financing" && !v.bankName)
      ctx.addIssue({
        code: "custom",
        path: ["bankName"],
        message: "Enter the bank name for bank financing.",
      });
    if (v.financingPreference === "other" && !v.financingPreferenceOther)
      ctx.addIssue({
        code: "custom",
        path: ["financingPreferenceOther"],
        message: "Describe how the contact will pay under Other financing.",
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
  const building = buildings.find((row) => row.id === input.propertyId);
  if (!building)
    return {
      success: false as const,
      message: "Select a property you have access to in this development.",
    };
  const selected = await db
    .select({
      id: units.id,
      code: units.code,
      price: sql<string | null>`coalesce(${units.price}, ${unitTypes.price})`,
      reservationFee: unitTypes.reservationFee,
      monthlyAmortization: unitTypes.monthlyAmortization,
    })
    .from(units)
    .leftJoin(unitTypes, eq(units.unitTypeId, unitTypes.id))
    .where(
      and(
        inArray(units.id, input.unitIds),
        eq(units.propertyId, building.id),
        held
          ? or(eq(units.status, "available"), eq(units.reservedDealId, held.dealId))
          : eq(units.status, "available"),
        grantedUnitsCondition(context, {
          propertyId: units.propertyId,
          floorId: units.floorId,
          unitId: units.id,
        }),
      ),
    );
  if (selected.length !== input.unitIds.length) {
    // Named by id so the window can drop just these and keep the rest of the selection.
    const unavailableUnitIds = input.unitIds.filter(
      (id) => !selected.some((unit) => unit.id === id),
    );
    return {
      success: false as const,
      message: `${unavailableUnitIds.length} selected ${
        unavailableUnitIds.length === 1 ? "unit is" : "units are"
      } no longer available, or not in this property or shared with you.`,
      unavailableUnitIds,
    };
  }
  if (building.parkingSpaces !== null && input.parkingSlotIds.length > building.parkingSpaces)
    return {
      success: false as const,
      message: `This property has ${building.parkingSpaces} parking slots. Select fewer.`,
    };
  // Each slot's own price, set on it or by its parking type.
  let slotPrices: (string | null)[] = [];
  let slotFees: (string | null)[] = [];
  let selectedSlots: { id: string; code: string; price: string | null }[] = [];
  if (input.parkingSlotIds.length) {
    const parking = await listParkingSlots(context, building.id);
    // Free slots, plus those this opportunity itself holds; a slot another one has since taken
    // stays unavailable even if this opportunity once chose it.
    const available = new Set(
      parking.filter((slot) => isSlotFreeFor(slot, held?.dealId)).map((slot) => slot.id),
    );
    const unavailableParkingSlotIds = input.parkingSlotIds.filter((id) => !available.has(id));
    if (unavailableParkingSlotIds.length)
      return {
        success: false as const,
        message: `${unavailableParkingSlotIds.length} selected parking ${
          unavailableParkingSlotIds.length === 1 ? "slot is" : "slots are"
        } no longer available or not shared with you.`,
        unavailableParkingSlotIds,
      };
    const priceOf = new Map(parking.map((slot) => [slot.id, slot.price]));
    slotPrices = input.parkingSlotIds.map((id) => priceOf.get(id) ?? null);
    const feeOf = new Map(parking.map((slot) => [slot.id, slot.reservationFee]));
    slotFees = input.parkingSlotIds.map((id) => feeOf.get(id) ?? null);
    const codeOf = new Map(parking.map((slot) => [slot.id, slot.code]));
    selectedSlots = input.parkingSlotIds
      .map((id) => ({ id, code: codeOf.get(id) ?? "", price: priceOf.get(id) ?? null }))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }
  const unpriced = selected.filter((unit) => !(Number(unit.price) > 0)).map((unit) => unit.code);
  if (unpriced.length)
    return {
      success: false as const,
      message: `Unit ${unpriced.sort().join(", ")} has no price yet. Set it on the property's Design page, then try again.`,
    };
  const unpricedSlots = selectedSlots
    .filter((slot) => !(Number(slot.price) > 0))
    .map((slot) => slot.code);
  if (unpricedSlots.length)
    return {
      success: false as const,
      message: `Parking ${unpricedSlots.join(", ")} has no price yet. Set it on the property's Design page, then try again.`,
    };
  const prices = opportunityPrice(
    selected.map((unit) => unit.price),
    slotPrices,
  );
  if (!prices)
    return {
      success: false as const,
      message: "The total is too large. Remove some units or parking and try again.",
    };
  const unitPrices = [...new Set(selected.map((unit) => Number(unit.price)))];
  const parkingPrices = [...new Set(slotPrices.map(Number))];
  return {
    success: true as const,
    ...prices,
    // Saved on the opportunity, so later unit type or slot edits don't change this sale.
    ...opportunityFees(selected, slotFees),
    /** Units whose type sets no reservation fee: the fee due is lower than it looks. */
    missingFee: missingFeeWarning(
      selected.filter((unit) => unit.reservationFee === null).map((unit) => unit.code),
    ),
    currency: building.currency,
    buildingTitle: building.title,
    /** Codes and prices of the selected units, in code order. */
    selectedUnits: selected
      .map((unit) => ({ id: unit.id, code: unit.code, price: unit.price! }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    /** Identifiers and prices of the selected parking slots, in order. */
    selectedSlots,
    /** The shared price when every selected unit costs the same; null when they differ. */
    unitPrice: unitPrices.length === 1 ? selected[0]!.price : null,
    /** The shared slot price when every selected slot costs the same; null when they differ. */
    parkingPrice: parkingPrices.length === 1 ? slotPrices[0]! : null,
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

export async function getOpportunityParking(input: unknown, dealId?: string) {
  const context = await requirePermission("deals.change_stage");
  const parsed = opportunitySelectionSchema
    .pick({ developmentId: true, propertyId: true })
    .safeParse(input);
  if (!parsed.success || !context.permissions.has("properties.view")) return null;
  const { developmentId, propertyId } = parsed.data;
  const buildings = await getPropertiesForDevelopment(context, developmentId);
  if (!buildings.some((building) => building.id === propertyId)) return null;
  // Slots this opportunity holds show as available to it, and only to it.
  const holder = dealId ? (await loadDeal(dealId))?.row.dealId : undefined;
  const slots = (await listParkingSlots(context, propertyId)).map((slot) =>
    isSlotFreeFor(slot, holder) ? { ...slot, status: "available" } : slot,
  );
  const floorIds = [...new Set(slots.flatMap((slot) => (slot.floorId ? [slot.floorId] : [])))];
  const parkingFloors = floorIds.length
    ? await db
        .select({ id: floors.id, label: floors.label })
        .from(floors)
        .where(and(eq(floors.propertyId, propertyId), inArray(floors.id, floorIds)))
        .orderBy(asc(floors.level))
    : [];
  return { slots, floors: parkingFloors };
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
  const parsed = detailsSchema.safeParse({
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

  const loaded = await loadDeal(v.dealId);
  if (!loaded) return notFoundFailure("Opportunity");
  const { context, row } = loaded;
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
          parkingSlots: v.parkingSlotIds.length,
          parkingSlotIds: v.parkingSlotIds,
          parkingAmount: estimate.parking,
          reservationFee: estimate.reservationFee,
          parkingReservationFee: estimate.parkingReservationFee,
          monthlyAmortization: estimate.monthlyAmortization,
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

const changeSchema = opportunitySelectionSchema.extend({ dealId: z.uuid() });

/**
 * Moves an open opportunity to other units, another tower or another development. The old units
 * and parking go back to Available, the new ones follow payment status, and payments stay on the bill,
 * whose lines are rebuilt for the new selection.
 */
export async function changeOpportunityUnits(input: unknown): Promise<DealActionResult> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;
  const loaded = await loadDeal(v.dealId);
  if (!loaded) return notFoundFailure("Opportunity");
  const { context, row } = loaded;
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
          parkingSlots: v.parkingSlotIds.length,
          parkingSlotIds: v.parkingSlotIds,
          parkingAmount: estimate.parking,
          reservationFee: estimate.reservationFee,
          parkingReservationFee: estimate.parkingReservationFee,
          monthlyAmortization: estimate.monthlyAmortization,
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
    if (outcome.kind === "unchanged")
      return { success: true, data: { id: v.dealId } } as DealActionResult;
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
    return { success: true, data: { id: v.dealId } } as DealActionResult;
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
    if (!opened.success) return opened as DealActionResult;
    revalidatePath("/pipeline");
    revalidatePath(`/contacts/${source.contactId}`);
    return { success: true, data: { id: opened.data.id } } as DealActionResult;
  } catch (error) {
    if (error instanceof InactiveAssigneeError) return validationFailure(error.message);
    logError("Another opportunity failed", error, { operation: "opportunity_add_another" });
    return databaseFailure("Couldn't open the opportunity.");
  }
}
