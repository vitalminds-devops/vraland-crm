/** Prefix and minimum digits of each kind of record code: OPP-000123, CON-000045, PROP-0007, DEV-0003. */
export const recordCodeFormats = {
  opportunity: { prefix: "OPP", digits: 6 },
  contact: { prefix: "CON", digits: 6 },
  property: { prefix: "PROP", digits: 4 },
  development: { prefix: "DEV", digits: 4 },
} as const;

export type RecordCodeKind = keyof typeof recordCodeFormats;

/** Pads to the minimum width and grows past it, so number 1234567 stays whole. */
export function formatRecordCode(kind: RecordCodeKind, value: number): string {
  const { prefix, digits } = recordCodeFormats[kind];
  return `${prefix}-${String(value).padStart(digits, "0")}`;
}
