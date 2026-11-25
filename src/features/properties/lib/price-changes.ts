type Amount = string | number | null | undefined;

const cents = (value: Amount) =>
  value === null || value === undefined || value === "" ? null : Math.round(Number(value) * 100);

/**
 * Whether saving `after` changes any money amount from `before` ("100" and "100.00" are the same).
 * A new record (`before` null) changes money when it sets any amount.
 */
export function changesMoney(
  before: Readonly<Record<string, Amount>> | null | undefined,
  after: Readonly<Record<string, Amount>>,
): boolean {
  return Object.keys(after).some((key) => cents(before?.[key]) !== cents(after[key]));
}

/** What a user without "Manage prices" is told when a save would change an amount. */
export const pricesNeedPermission = "You can't change prices and fees on this property.";
