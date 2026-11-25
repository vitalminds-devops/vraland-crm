import { unitEnding } from "./floor-layout";

/** Colours a floor group's name can take; dark enough to read on white, and apart from status colours. */
export const groupColors = [
  { value: "blue", label: "Blue", hex: "#1d4ed8" },
  { value: "teal", label: "Teal", hex: "#0f766e" },
  { value: "green", label: "Green", hex: "#15803d" },
  { value: "violet", label: "Violet", hex: "#6d28d9" },
  { value: "pink", label: "Pink", hex: "#be185d" },
  { value: "orange", label: "Orange", hex: "#c2410c" },
  { value: "cyan", label: "Cyan", hex: "#0e7490" },
  { value: "slate", label: "Slate", hex: "#334155" },
] as const;

export type GroupColor = (typeof groupColors)[number]["value"];

/** Which of a floor's units a section takes: all, odd or even numbers, or units picked by ending. */
export const groupSides = [
  { value: "all", label: "All units", example: "" },
  { value: "odd", label: "Odd", example: "201, 203… · A, C…" },
  { value: "even", label: "Even", example: "202, 204… · B, D…" },
  { value: "pick", label: "Pick units", example: "" },
] as const;

export type GroupSide = (typeof groupSides)[number]["value"];

/**
 * A section: floors named together, such as Tower A for floors 1–10, Sunrise for the even
 * units, or Garden for units A to F, shown in its colour on each of its units.
 */
export type FloorGroup = {
  id: string;
  name: string;
  color: GroupColor;
  floorIds: string[];
  /** Missing on sections saved before sides existed: all units. */
  side?: GroupSide;
  /** With "pick": the unit endings it takes on each of its floors, such as A, B or 01, 03. */
  endings?: string[];
};

/** What a unit shows of its section. */
export type UnitGroup = { name: string; hex: string };

export const groupHex = (color: string) =>
  groupColors.find((option) => option.value === color)?.hex ?? groupColors[0].hex;

/**
 * Odd or even from the end of a unit's code: odd digits (201, 203) and the letters A, C, E… are
 * odd; even digits and B, D, F… are even. Null when the code ends in neither.
 */
export function unitParity(code: string): "odd" | "even" | null {
  const last = code.trim().slice(-1).toUpperCase();
  if (/[0-9]/.test(last)) return Number(last) % 2 === 1 ? "odd" : "even";
  if (/[A-Z]/.test(last)) return (last.charCodeAt(0) - 65) % 2 === 0 ? "odd" : "even";
  return null;
}

/** Whether a section takes the unit with this ending. */
function takes(group: Pick<FloorGroup, "side" | "endings">, ending: string) {
  const side = group.side ?? "all";
  if (side === "all") return true;
  if (side === "pick") return (group.endings ?? []).includes(ending);
  return unitParity(ending) === side;
}

/** Whether two sections on one floor could both take a unit. */
export function sidesOverlap(
  a: Pick<FloorGroup, "side" | "endings">,
  b: Pick<FloorGroup, "side" | "endings">,
): boolean {
  const [sa, sb] = [a.side ?? "all", b.side ?? "all"];
  if (sa === "all" || sb === "all") return true;
  if (sa === "pick") return (a.endings ?? []).some((ending) => takes(b, ending));
  if (sb === "pick") return (b.endings ?? []).some((ending) => takes(a, ending));
  return sa === sb;
}

/** The section a unit belongs to, from its floor and its number, or null when it is in none. */
export function groupOfUnit(
  groups: readonly FloorGroup[] | null | undefined,
  floor: { id: string; level: number },
  code: string,
): UnitGroup | null {
  const ending = unitEnding(code, floor.level);
  const group = groups?.find(
    (candidate) => candidate.floorIds.includes(floor.id) && takes(candidate, ending),
  );
  return group ? { name: group.name, hex: groupHex(group.color) } : null;
}

/** The sections on a floor, in their colours, for the floor menu. */
export function sectionsOfFloor(
  groups: readonly FloorGroup[] | null | undefined,
  floorId: string,
): UnitGroup[] {
  return (groups ?? [])
    .filter((group) => group.floorIds.includes(floorId))
    .map((group) => ({ name: group.name, hex: groupHex(group.color) }));
}

/** Every unit ending in a property (2A -> A, 203 -> 03), in order, for sections that pick units. */
export function unitEndings(
  units: readonly { code: string; floorId: string }[],
  floors: readonly { id: string; level: number }[],
): string[] {
  const levelOf = new Map(floors.map((floor) => [floor.id, floor.level]));
  return [
    ...new Set(units.map((unit) => unitEnding(unit.code, levelOf.get(unit.floorId) ?? 0))),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
