import { unitCode } from "./unit-codes";

/**
 * How a property numbers its units, chosen once when its floors are set up:
 * letters (2A, 2B), numbers (201, 202) or custom endings (201, 203 … 217).
 */
export type UnitIdentifier = {
  style: "letter" | "number" | "custom";
  /** Units created on each new floor, for letters and numbers. */
  unitsPerFloor: number;
  /** The unit endings in order, for custom: ["01", "03", "05"]. */
  endings: string[];
  /** Floor levels that are never built, such as 4 or 13. */
  skipFloors: number[];
  /** Parking across the property (P1, P2) or by floor like its units (P2A, P201); unset is property. */
  parking?: "property" | "floor";
};

/** Properties set up before numbering was chosen: letters, with floor 4 skipped. */
export const legacyIdentifier: UnitIdentifier = {
  style: "letter",
  unitsPerFloor: 0,
  endings: [],
  skipFloors: [4],
};

export const MAX_SETUP_FLOORS = 100;
export const MAX_UNITS_PER_FLOOR = 100;

/** "01, 03 05" -> ["01", "03", "05"]; letters and digits only, each once, in the order typed. */
export function parseEndings(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,]+/)) {
    const ending = part.trim().toUpperCase();
    if (/^[0-9A-Z]{1,4}$/.test(ending)) seen.add(ending);
  }
  return [...seen];
}

/** "4, 13" -> [4, 13]. */
export function parseFloorList(text: string): number[] {
  return [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((part) => Number(part))
        .filter((level) => Number.isInteger(level) && level > 0 && level <= 999),
    ),
  ].sort((a, b) => a - b);
}

/** Every level from `from` to `to`, leaving out the skipped ones. */
export function floorLevels(from: number, to: number, skip: readonly number[]): number[] {
  const levels: number[] = [];
  for (let level = from; level <= to; level += 1) if (!skip.includes(level)) levels.push(level);
  return levels;
}

/** The level a newly added floor takes: one above the top floor, past skipped levels. */
export function nextLevel(existing: readonly number[], skip: readonly number[]): number {
  let level = existing.length ? Math.max(...existing) + 1 : 1;
  while (skip.includes(level)) level += 1;
  return level;
}

/** The unit's code for its position on the floor (1 = first); null past the last custom ending. */
export function codeAt(numbering: UnitIdentifier, level: number, position: number): string | null {
  if (numbering.style === "custom") {
    const ending = numbering.endings[position - 1];
    return ending === undefined ? null : `${level}${ending}`;
  }
  // Two digits keep floor 10 apart from floor 1: 1001, not 101.
  if (numbering.style === "number") return `${level}${String(position).padStart(2, "0")}`;
  return unitCode(level, position);
}

/** A full floor's codes: every custom ending, or `count` letters or numbers. */
export function floorCodes(numbering: UnitIdentifier, level: number, count: number): string[] {
  const total = numbering.style === "custom" ? Math.min(count, numbering.endings.length) : count;
  return Array.from({ length: total }, (_, index) => codeAt(numbering, level, index + 1)!);
}

/** The first code on the floor not yet used; null when a custom floor is full. */
export function nextFreeCode(
  numbering: UnitIdentifier,
  level: number,
  taken: ReadonlySet<string>,
): string | null {
  for (let position = 1; position <= 10_000; position += 1) {
    const code = codeAt(numbering, level, position);
    if (code === null) return null;
    if (!taken.has(code)) return code;
  }
  return null;
}

/** The ways a property can number its units, for choosing one. */
export const identifierStyles = [
  { value: "letter", label: "Letters", example: "2A, 2B, 2C" },
  { value: "number", label: "Numbers", example: "201, 202, 203" },
  { value: "custom", label: "Custom", example: "201, 203 … 217" },
] as const;

/**
 * New identifiers for a floor's units under a numbering, keeping their current order (2A, 2B…
 * become 201, 202…). Only units whose identifier changes are listed. Null when a custom numbering
 * has fewer endings than the floor has units.
 */
export function floorRenames(
  units: readonly { id: string; code: string }[],
  numbering: UnitIdentifier,
  level: number,
): { id: string; code: string }[] | null {
  const ordered = [...units].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
  const codes = floorCodes(numbering, level, ordered.length);
  if (codes.length < ordered.length) return null;
  return ordered.flatMap((unit, index) =>
    unit.code === codes[index] ? [] : [{ id: unit.id, code: codes[index]! }],
  );
}
