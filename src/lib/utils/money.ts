/** "₱6,200,000" for whole amounts, "₱6,200,000.50" otherwise; null when there's no amount. */
export function formatMoney(
  value: number | string | null | undefined,
  currency = "PHP",
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** "₱30M", "₱2.5M", "₱850K": a short price for tags; null when there's no amount. */
export function formatMoneyShort(
  value: number | string | null | undefined,
  currency = "PHP",
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(amount);
}
