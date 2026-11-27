import "server-only";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  contacts,
  dealContacts,
  deals,
  developments,
  floors,
  pipelineStages,
  unitTypes,
  units,
} from "@/db/schema";
import {
  opportunityAddressSchema,
  opportunityInterestSchema,
} from "@/features/contacts/schemas/opportunity-contact.schema";
import { canAccessResource } from "@/lib/permissions/authorization";
import { grantedUnitsCondition } from "@/lib/permissions/property-access";
import { type AuthorizationContext } from "@/lib/permissions/policy";
import { getPropertiesForDevelopment } from "@/features/properties/queries/property-floor-unit.queries";
import { listParkingSlots } from "@/features/properties/queries/parking.queries";
import {
  isSlotFreeFor,
  missingFeeWarning,
  opportunityFees,
  opportunityPrice,
  opportunitySelectionSchema,
} from "../lib/opportunity-pricing";
import { isContactsFirstDeal } from "../lib/first-deal";
import { documentsOnFile } from "../lib/opportunity-requirements";
import { canMoveStage, resolveMoveRole } from "../lib/stage-transitions";

/** The lead or opportunity with its primary contact, when the user can see it. */
export async function loadDeal(context: AuthorizationContext, dealId: string) {
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
  return row ?? null;
}

/**
 * Why this user's role rules (own opportunities, moving back, viewers) would refuse the move, or
 * null. Checked before Move to Opportunity saves anything; the move itself checks again. A move
 * that only waits for approval is not refused: the details are saved for the approver.
 */
export async function moveRefusal(
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

export type OpportunityDraft = NonNullable<Awaited<ReturnType<typeof readOpportunityDraft>>>;

/** What the Opportunity details dialog starts from: saved values, the developments, and files on record. */
export async function readOpportunityDraft(context: AuthorizationContext, dealId: string) {
  const row = await loadDeal(context, dealId);
  if (!row?.contactId) return null;
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

export async function estimateSelection(
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
      code: units.identifier,
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
  let slotAmounts: { reservationFee: string | null; monthlyAmortization: string | null }[] = [];
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
    const slotOf = new Map(parking.map((slot) => [slot.id, slot]));
    slotAmounts = input.parkingSlotIds.map((id) => ({
      reservationFee: slotOf.get(id)?.reservationFee ?? null,
      monthlyAmortization: slotOf.get(id)?.monthlyAmortization ?? null,
    }));
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
    ...opportunityFees(selected, slotAmounts),
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
    parkingSlotLimit: building.parkingSpaces,
  };
}

/** The property's parking for the picker; slots this opportunity holds show as free to it. */
export async function readOpportunityParking(
  context: AuthorizationContext,
  input: unknown,
  dealId?: string,
) {
  const parsed = opportunitySelectionSchema
    .pick({ developmentId: true, propertyId: true })
    .safeParse(input);
  if (!parsed.success || !context.permissions.has("properties.view")) return null;
  const { developmentId, propertyId } = parsed.data;
  const buildings = await getPropertiesForDevelopment(context, developmentId);
  if (!buildings.some((building) => building.id === propertyId)) return null;
  // Slots this opportunity holds show as available to it, and only to it.
  const holder = dealId ? (await loadDeal(context, dealId))?.dealId : undefined;
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
