/**
 * The price to suggest on each unit's bill line. Units keep their own prices while those still add
 * up to the opportunity's agreed amount; otherwise the agreed amount is split evenly. Older
 * single-unit deals without a parking amount keep their entered amount.
 */
export function suggestedUnitPrices(
  unitPrices: (string | null)[],
  deal: { amount: string | null; parkingAmount: string | null },
): (string | null)[] {
  const unitsTotal =
    deal.parkingAmount !== null && deal.amount !== null
      ? Number(deal.amount) - Number(deal.parkingAmount)
      : null;
  const cents = (value: number) => Math.round(value * 100);
  if (unitsTotal === null)
    return unitPrices.map((price) => (unitPrices.length === 1 ? deal.amount : null) ?? price);
  const ownTotal = unitPrices.reduce((sum, price) => sum + Number(price), 0);
  if (unitPrices.every((price) => Number(price) > 0) && cents(ownTotal) === cents(unitsTotal))
    return unitPrices;
  return unitPrices.map(() => (unitsTotal / unitPrices.length).toFixed(2));
}
