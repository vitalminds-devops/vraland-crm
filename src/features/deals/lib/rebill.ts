import { toAmount, toCents } from "@/lib/utils/money";

export type RebillInput = {
  units: { id: string; code: string; price: string }[];
  /** "Tower 2 · Fairfield Heights", appended to each unit line. */
  place: string;
  buildingTitle: string;
  /** Each parking slot's identifier and price; one bill line each. */
  slots: { id: string; code: string; price: string }[];
  previous: { unitPrice: string; miscellaneousFee: string; reservationDiscount: string };
  /** The bill's current lines: a unit or slot already billed keeps its price and fee. */
  keep?: readonly {
    unitLabel: string;
    unitPrice: string;
    miscellaneousFee: string;
    unitId?: string | null;
    parkingSlotId?: string | null;
  }[];
  paid: number;
};

/** Whether a new pick differs from the opportunity's current one (property, units or parking). */
export function selectionChanged(
  before: {
    propertyId: string | null;
    unitIds: readonly string[];
    parkingSlotIds: readonly string[];
  },
  after: { buildingId: string; unitIds: readonly string[]; parkingSlotIds: readonly string[] },
): boolean {
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((id) => b.includes(id));
  return (
    before.propertyId !== after.buildingId ||
    !same(before.unitIds, after.unitIds) ||
    !same(before.parkingSlotIds, after.parkingSlotIds)
  );
}

/**
 * The bill lines for an opportunity's new units and parking, one line each. Units and slots
 * already on the bill keep the price and fee they were billed at (found by the unit or slot, or by
 * label on lines saved before lines knew it), so a price change since never reprices a sale;
 * new units take today's price and the old bill's miscellaneous fee rate, new parking none. The reservation discount stays, and the total may not fall below what is paid.
 */
export function rebuildBill(input: RebillInput) {
  const oldPrice = Number(input.previous.unitPrice);
  const miscRate = oldPrice > 0 ? Number(input.previous.miscellaneousFee) / oldPrice : 0;
  const keep = input.keep ?? [];
  const line = (
    ref: { unitId: string | null; parkingSlotId: string | null },
    unitLabel: string,
    price: number,
    fee: number,
  ) => {
    const kept =
      keep.find((k) =>
        ref.unitId ? k.unitId === ref.unitId : k.parkingSlotId === ref.parkingSlotId,
      ) ?? keep.find((k) => !k.unitId && !k.parkingSlotId && k.unitLabel === unitLabel);
    return kept
      ? { ...ref, unitLabel, price: Number(kept.unitPrice), fee: Number(kept.miscellaneousFee) }
      : { ...ref, unitLabel, price, fee };
  };
  const priced = [
    ...input.units.map((unit) => {
      const price = Number(unit.price);
      return line(
        { unitId: unit.id, parkingSlotId: null },
        `Unit ${unit.code} · ${input.place}`,
        price,
        toCents(price * miscRate) / 100,
      );
    }),
    ...input.slots.map((slot) =>
      line(
        { unitId: null, parkingSlotId: slot.id },
        `Parking ${slot.code} · ${input.buildingTitle}`,
        Number(slot.price),
        0,
      ),
    ),
  ];

  const unitPrice = priced.reduce((sum, line) => sum + line.price, 0);
  const miscellaneousFee = priced.reduce((sum, line) => sum + line.fee, 0);
  const discount = Number(input.previous.reservationDiscount);
  if (discount > unitPrice) return { error: "discount" as const };
  if (unitPrice - discount + miscellaneousFee < input.paid) return { error: "below-paid" as const };

  return {
    unitLabel: priced
      .map((line) => line.unitLabel)
      .join(" + ")
      .slice(0, 220),
    unitPrice: toAmount(unitPrice),
    miscellaneousFee: toAmount(miscellaneousFee),
    lines: priced.map((line) => ({
      unitId: line.unitId,
      parkingSlotId: line.parkingSlotId,
      unitLabel: line.unitLabel,
      unitPrice: toAmount(line.price),
      miscellaneousFee: toAmount(line.fee),
    })),
  };
}
