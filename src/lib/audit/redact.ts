const REDACTION_MASK = "[redacted]";

const REDACTED_KEYS = [
  // Government / personal identifiers.
  "idnumber",
  "nationalid",
  "governmentid",
  "govtid",
  "passportnumber",
  "passportno",
  "driverslicense",
  "licensenumber",
  "sssnumber",
  "sss",
  "gsisnumber",
  "gsis",
  "philhealthnumber",
  "philhealth",
  "pagibignumber",
  "pagibig",
  "tinnumber",
  "tin",
  // Payment credentials.
  "bankaccountnumber",
  "accountnumber",
  "cardnumber",
  "iban",
  "swiftcode",
  "cvv",
  "password",
  "passwordhash",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "secret",
  "token",
  "signature",
  "authorization",
  "cookie",
  "sessionid",
] as const;

const PRESENCE_ONLY_KEYS = [
  "bodyhtml",
  "bodytext",
  "body",
  "configuration",
  "notes",
  "terms",
] as const;

const normalizeKey = (key: string) =>
  key
    .split(".")
    .at(-1)!
    .replace(/[^a-z0-9]/gi, "")
    .replace(/\d+$/, "")
    .toLowerCase();

const matchesKey = (normalized: string, candidates: readonly string[]) =>
  candidates.some((candidate) => normalized === candidate || normalized.endsWith(candidate));

function isRedactedKey(key: string): boolean {
  return matchesKey(normalizeKey(key), REDACTED_KEYS);
}

/** True when a field's value should be recorded as a presence marker only. */
function isPresenceOnlyKey(key: string): boolean {
  return matchesKey(normalizeKey(key), PRESENCE_ONLY_KEYS);
}

function maskIdentifier(value: unknown): string {
  if (value === null || value === undefined) return REDACTION_MASK;
  const text = typeof value === "string" ? value : String(value);
  if (!text) return REDACTION_MASK;
  if (text.length <= 4) return REDACTION_MASK;
  return `${REDACTION_MASK}${text.slice(-4)}`;
}

export function redactValue(key: string, value: unknown): unknown {
  if (isRedactedKey(key)) return maskIdentifier(value);
  if (isPresenceOnlyKey(key)) return value === null || value === undefined ? null : "[present]";
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Normalize a value for the changed/unchanged comparison. */
function comparable(value: unknown): string {
  if (value === null || value === undefined) return "\u0000null";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return comparable(left) === comparable(right);
}

export function buildChangeSet(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): {
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
} {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    const previous = before?.[key] ?? null;
    const next = after?.[key] ?? null;
    if (sameValue(previous, next)) continue;
    oldValues[key] = redactValue(key, previous);
    newValues[key] = redactValue(key, next);
  }
  return { oldValues, newValues };
}

/** True when `buildChangeSet` found nothing worth recording. */
export function isEmptyChangeSet(changeSet: {
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}): boolean {
  return (
    Object.keys(changeSet.oldValues).length === 0 && Object.keys(changeSet.newValues).length === 0
  );
}
