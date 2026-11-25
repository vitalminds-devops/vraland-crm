const money = (value: number) => value.toFixed(2);
const cents = (value: number) => Math.round(value * 100) / 100;

export type RebillInput = {
  units: { code: string; price: string }[];
  /** "Tower 2 · Fairfield Heights", appended to each unit line. */
  place: string;
  buildingTitle: string;
  /** Each parking slot's identifier and price; one bill line each. */
  slots: { code: string; price: string }[];
  previous: { unitPrice: string; miscellaneousFee: string; reservationDiscount: string };
  paid: number;
};

/**
 * The bill lines for an opportunity's new units and parking, one line each. Units keep the old
 * bill's miscellaneous fee rate; parking carries none, as on a new bill. The reservation discount
 * stays, and the new total may not fall below what is already paid.
 */
export function rebuildBill(input: RebillInput) {
  const oldPrice = Number(input.previous.unitPrice);
  const miscRate = oldPrice > 0 ? Number(input.previous.miscellaneousFee) / oldPrice : 0;
  const priced = [
    ...input.units.map((unit) => {
      const price = Number(unit.price);
      return {
        unitLabel: `Unit ${unit.code} · ${input.place}`,
        price,
        fee: cents(price * miscRate),
      };
    }),
    ...input.slots.map((slot) => ({
      unitLabel: `Parking ${slot.code} · ${input.buildingTitle}`,
      price: Number(slot.price),
      fee: 0,
    })),
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
    unitPrice: money(unitPrice),
    miscellaneousFee: money(miscellaneousFee),
    lines: priced.map((line) => ({
      unitLabel: line.unitLabel,
      unitPrice: money(line.price),
      miscellaneousFee: money(line.fee),
    })),
  };
}
