import { toCents } from "@/lib/utils/money";

type Amount = string | number | null | undefined;

/**
 * Whether saving `after` changes any money amount from `before` ("100" and "100.00" are the same).
 * A new record (`before` null) changes money when it sets any amount.
 */
export function changesMoney(
  before: Readonly<Record<string, Amount>> | null | undefined,
  after: Readonly<Record<string, Amount>>,
): boolean {
  return Object.keys(after).some((key) => toCents(before?.[key]) !== toCents(after[key]));
}

/** What a user without "Manage prices" is told when a save would change an amount. */
export const pricesNeedPermission = "You can't change prices and fees on this property.";

/** Why a reserved or sold unit or slot keeps its price: the sale's price lives on its bill. */
export const heldPriceMessage = (name: string) =>
  `${name} is reserved or sold. Change its price in Billing.`;
