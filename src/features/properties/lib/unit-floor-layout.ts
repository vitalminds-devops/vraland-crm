export const UNIT_ROOM_WIDTH = 4.4;
export type UnitFloorArrangement = "auto" | "single" | "double";

export function unitFloorColumns(count: number, arrangement: UnitFloorArrangement = "auto") {
  return arrangement === "single"
    ? count
    : arrangement === "double" || count > 4
      ? Math.ceil(count / 2)
      : count;
}

export function unitRoomPosition(
  index: number,
  count: number,
  arrangement: UnitFloorArrangement = "auto",
): [number, number, number] {
  const columns = unitFloorColumns(count, arrangement);
  return [
    ((index % columns) - (columns - 1) / 2) * UNIT_ROOM_WIDTH,
    0,
    count > columns ? (index < columns ? -4.3 : 4.3) : 0,
  ];
}
