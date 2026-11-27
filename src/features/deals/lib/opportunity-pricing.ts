import { z } from "zod";

export const opportunitySelectionSchema = z.object({
  developmentId: z.uuid({ error: "Select a development." }),
  propertyId: z.uuid({ error: "Select a property." }),
  unitIds: z
    .array(z.uuid())
    .min(1, "Select at least one unit.")
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, "Select each unit only once."),
  parkingSlotIds: z
    .array(z.uuid())
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, "Select each parking slot only once.")
    .default([]),
});

/**
 * Work in cents so the displayed estimate and saved amount agree. Each unit and each parking slot
 * has its own price.
 */
export function opportunityPrice(unitPrices: (string | null)[], slotPrices: (string | null)[]) {
  const toCents = (price: string | null) => Math.round(Number(price) * 100);
  const unitCents = unitPrices.map(toCents);
  const slotCents = slotPrices.map(toCents);
  if (!unitCents.length || unitCents.some((cents) => !(cents > 0))) return null;
  if (slotCents.some((cents) => !(cents > 0))) return null;
  const units = unitCents.reduce((sum, cents) => sum + cents, 0);
  const parking = slotCents.reduce((sum, cents) => sum + cents, 0);
  if (!Number.isSafeInteger(units + parking)) return null;
  return {
    units: (units / 100).toFixed(2),
    parking: (parking / 100).toFixed(2),
    total: ((units + parking) / 100).toFixed(2),
  };
}

/**
 * The reservation fee and monthly amortization quoted for a selection: unit type fees plus slot
 * fees, and unit type monthly amounts, added in cents. Null when none of them sets one.
 */
export function opportunityFees(
  units: readonly { reservationFee: string | null; monthlyAmortization: string | null }[],
  slotFees: readonly (string | null)[],
) {
  const total = (amounts: readonly (string | null)[]) => {
    const set = amounts.filter((amount): amount is string => amount !== null && amount !== "");
    if (!set.length) return null;
    return (set.reduce((sum, amount) => sum + Math.round(Number(amount) * 100), 0) / 100).toFixed(
      2,
    );
  };
  return {
    reservationFee: total([...units.map((unit) => unit.reservationFee), ...slotFees]),
    parkingReservationFee: total(slotFees),
    monthlyAmortization: total(units.map((unit) => unit.monthlyAmortization)),
  };
}

/** A slot an opportunity may pick: free, or held by that same opportunity. */
export const isSlotFreeFor = (
  slot: { status: string; reservedDealId: string | null },
  dealId: string | undefined,
) => slot.status === "available" || (dealId !== undefined && slot.reservedDealId === dealId);

/** "Unit 2A has no reservation fee." / "Units 2A, 2B have no reservation fee."; null when all do. */
export function missingFeeWarning(codes: readonly string[]): string | null {
  if (!codes.length) return null;
  const sorted = [...codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return codes.length === 1
    ? `Unit ${sorted[0]} has no reservation fee. Set it on its unit type.`
    : `Units ${sorted.join(", ")} have no reservation fee. Set it on their unit types.`;
}
