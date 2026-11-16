/**
 * Display-only formatters for the properties feature.
 */

export function label(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (v) => v.toUpperCase());
}

export function formatDateForInput(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}
