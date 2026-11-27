import { codeAt, type UnitIdentifier } from "./unit-identifier";

/** The first free "P<n>" after the slots already taken, so P1, P2, … with gaps refilled last. */
export function nextParkingCode(taken: string[]): string {
  const used = new Set(taken);
  let index = taken.length + 1;
  while (used.has(`P${index}`)) index += 1;
  return `P${index}`;
}

/** Natural order, so P2 comes before P10. */
export function compareParkingCodes(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** The floor choice for parking slots on no floor. */
export const NO_FLOOR = "none";

/** A slot's code by floor: P and the unit identifier (P2A, P201). Custom endings are for units, so it counts. */
export function floorParkingCode(
  numbering: UnitIdentifier,
  level: number,
  position: number,
): string {
  const style = numbering.style === "custom" ? "number" : numbering.style;
  return `P${codeAt({ ...numbering, style }, level, position)}`;
}

/** The next free code for a new slot: by floor when the property names parking by floor, else P1, P2… */
export function nextSlotCode(
  numbering: UnitIdentifier,
  level: number | null,
  taken: readonly string[],
): string {
  if (numbering.parking !== "floor" || level === null) return nextParkingCode([...taken]);
  const used = new Set(taken);
  let position = 1;
  while (used.has(floorParkingCode(numbering, level, position))) position += 1;
  return floorParkingCode(numbering, level, position);
}

/**
 * New codes for slots in their current order: by floor on `level`, or P1, P2… when `level` is null
 * (the whole property's slots, already in floor order). Only slots whose code changes are listed.
 */
export function slotRenames(
  slots: readonly { id: string; code: string }[],
  numbering: UnitIdentifier,
  level: number | null,
): { id: string; code: string }[] {
  const ordered =
    level === null ? slots : [...slots].sort((a, b) => compareParkingCodes(a.code, b.code));
  return ordered.flatMap((slot, index) => {
    const code = level === null ? `P${index + 1}` : floorParkingCode(numbering, level, index + 1);
    return slot.code === code ? [] : [{ id: slot.id, code }];
  });
}
