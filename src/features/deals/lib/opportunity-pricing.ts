import { z } from "zod";

export const opportunitySelectionSchema = z.object({
  developmentId: z.uuid({ error: "Select a development." }),
  buildingId: z.uuid({ error: "Select a building." }),
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

/** Work in cents so the displayed estimate and saved amount agree. */
export function opportunityPrice(
  unitPrice: string | null,
  unitCount: number,
  parkingPrice: string | null,
  parkingSlots: number,
) {
  const unitCents = Math.round(Number(unitPrice) * 100);
  const parkingCents = Math.round(Number(parkingPrice) * 100);
  if (!(unitCents > 0) || (parkingSlots > 0 && !(parkingCents > 0))) return null;
  const units = unitCents * unitCount;
  const parking = parkingCents * parkingSlots;
  if (!Number.isSafeInteger(units + parking)) return null;
  return {
    units: (units / 100).toFixed(2),
    parking: (parking / 100).toFixed(2),
    total: ((units + parking) / 100).toFixed(2),
  };
}
