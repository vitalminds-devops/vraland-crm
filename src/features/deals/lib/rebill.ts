const money = (value: number) => value.toFixed(2);
const cents = (value: number) => Math.round(value * 100) / 100;

export type RebillInput = {
  unitCodes: string[];
  /** "Tower 2 · Fairfield Heights", appended to each unit line. */
  place: string;
  buildingTitle: string;
  unitPrice: string;
  parkingSlots: number;
  /** Total for all slots. */
  parkingPrice: string;
  previous: { unitPrice: string; miscellaneousFee: string; reservationDiscount: string };
  paid: number;
};

/**
 * The bill lines for an opportunity's new units. The miscellaneous fee keeps the old bill's rate,
 * the reservation discount stays, and the new total may not fall below what is already paid.
 */
export function rebuildBill(input: RebillInput) {
  const oldPrice = Number(input.previous.unitPrice);
  const miscRate = oldPrice > 0 ? Number(input.previous.miscellaneousFee) / oldPrice : 0;
  const priced = [
    ...input.unitCodes.map((code) => ({
      unitLabel: `Unit ${code} · ${input.place}`,
      price: Number(input.unitPrice),
    })),
    ...(input.parkingSlots
      ? [
          {
            unitLabel: `Parking (${input.parkingSlots} ${input.parkingSlots === 1 ? "slot" : "slots"}) · ${input.buildingTitle}`,
            price: Number(input.parkingPrice),
          },
        ]
      : []),
  ].map((line) => ({ ...line, fee: cents(line.price * miscRate) }));

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
    unitPrice: money(unitPrice),
    miscellaneousFee: money(miscellaneousFee),
    lines: priced.map((line) => ({
      unitLabel: line.unitLabel,
      unitPrice: money(line.price),
      miscellaneousFee: money(line.fee),
    })),
  };
}
