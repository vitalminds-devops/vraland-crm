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

/** "₱6,200,000.00": always two decimals, for bills and payments; null when there's no amount. */
export function formatAmount(
  value: number | string | null | undefined,
  currency = "PHP",
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(amount);
}

/** Whole centavos, so amounts compare exactly ("100" and "100.004" are the same). */
export function toCents(value: number | string): number;
export function toCents(value: number | string | null | undefined): number | null;
export function toCents(value: number | string | null | undefined): number | null {
  return value === null || value === undefined || value === ""
    ? null
    : Math.round(Number(value) * 100);
}

/** A number as a numeric column stores it: "1234.50". */
export function toAmount(value: number): string;
export function toAmount(value: number | null): string | null;
export function toAmount(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
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
