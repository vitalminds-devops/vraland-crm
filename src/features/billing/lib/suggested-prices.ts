import { toAmount, toCents } from "@/lib/utils/money";

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
  if (unitsTotal === null)
    return unitPrices.map((price) => (unitPrices.length === 1 ? deal.amount : null) ?? price);
  const ownTotal = unitPrices.reduce((sum, price) => sum + Number(price), 0);
  if (unitPrices.every((price) => Number(price) > 0) && toCents(ownTotal) === toCents(unitsTotal))
    return unitPrices;
  return unitPrices.map(() => toAmount(unitsTotal / unitPrices.length));
}

/**
 * The price to suggest on each parking slot's bill line: the slots' own prices while they still add
 * up to the parking amount quoted on the opportunity, else that amount split across them (the last
 * slot takes the odd centavo), so a price change after the quote never changes the bill.
 */
export function suggestedParkingPrices(
  slotPrices: (string | null)[],
  quoted: string | null,
): (string | null)[] {
  if (quoted === null || !slotPrices.length) return slotPrices;
  const cents = toCents(quoted);
  const ownCents = slotPrices.reduce((sum, price) => sum + toCents(price ?? 0), 0);
  if (slotPrices.every((price) => Number(price) > 0) && ownCents === cents) return slotPrices;
  const each = Math.floor(cents / slotPrices.length);
  return slotPrices.map((_, index) =>
    toAmount((index === slotPrices.length - 1 ? cents - each * index : each) / 100),
  );
}
