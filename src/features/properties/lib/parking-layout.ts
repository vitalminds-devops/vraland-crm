import {
  defaultFloorLayout,
  footprint,
  freeSpot,
  overlaps,
  type FloorLayout,
  type FloorSpace,
  type LayoutItem,
  type ParkingSpot,
} from "./floor-layout";

/** Where a slot sits in the plain two-row lot, used until a floor's parking is designed. */
export function parkingBayPosition(index: number, count: number): [number, number, number] {
  const columns = Math.ceil(count / 2);
  return [((index % columns) - (columns - 1) / 2) * 2.2, 0, index < columns ? -2.7 : 2.7];
}

/** A standard 2.5 × 5 m bay. */
export const SLOT_SIZE: [number, number] = [2.5, 5];

/** The shared spaces a parking view draws: drive paths and what stands in the way. */
const parkingKinds = new Set(["driveway", "ramp", "pillar", "stairs", "elevator"]);

/** A floor's parking as the parking view draws it, from the floor's design. */
export type ParkingPlan = {
  width: number;
  depth: number;
  slots: ParkingSpot[];
  pieces: FloorSpace[];
};

/**
 * The parking stored by the old separate parking designer, before parking moved into the floor
 * design. Only read now, to carry a floor's parking into its floor design.
 */
export type ParkingLayout = {
  width: number;
  depth: number;
  slots: ParkingSpot[];
  pieces: FloorSpace[];
};

/** What the parking view draws for a floor: its designed slots, or the old parking design. */
export function parkingPlan(floor: {
  layout?: FloorLayout | null;
  parkingLayout?: ParkingLayout | null;
}): ParkingPlan | null {
  const layout = floor.layout;
  if (layout?.parking?.length)
    return {
      width: layout.width,
      depth: layout.depth,
      slots: layout.parking,
      pieces: layout.spaces.filter((space) => parkingKinds.has(space.kind)),
    };
  return floor.parkingLayout ?? null;
}

/**
 * Puts slots onto a floor plan, each in the first free spot, or in a new row along the bottom
 * when the floor is full.
 */
export function placeSlotsOnFloor(layout: FloorLayout, slotIds: readonly string[]): FloorLayout {
  const [w, h] = SLOT_SIZE;
  let { depth } = layout;
  const parking = [...(layout.parking ?? [])];
  const items: LayoutItem[] = [...layout.units, ...layout.spaces, ...parking];
  for (const slotId of slotIds) {
    let spot = freeSpot([w, h], items, layout.width, depth);
    const probe = { id: "", ...spot, w, h, rotation: 0 as const };
    if (items.some((item) => overlaps(probe, item)) || spot.y + h > depth) {
      spot = { x: 0, y: depth };
      depth += h;
    }
    const slot = { id: `s-${slotId.slice(0, 8)}`, slotId, ...spot, w, h, rotation: 0 as const };
    parking.push(slot);
    items.push(slot);
  }
  return { ...layout, depth, parking };
}

/**
 * The floor plan the designer starts from, with every parking slot on the floor on it: slots
 * already placed stay, an old separate parking design is set below the units, and any slot not
 * placed yet takes a free spot.
 */
export function floorWithParking(
  layout: FloorLayout | null,
  legacy: ParkingLayout | null,
  floorSlotIds: readonly string[],
): FloorLayout {
  const base = layout ?? defaultFloorLayout;
  const onFloor = new Set(floorSlotIds);
  let next: FloorLayout = {
    ...base,
    parking: (base.parking ?? []).filter((slot) => !slot.slotId || onFloor.has(slot.slotId)),
  };
  if (!next.parking?.length && legacy?.slots.length) {
    // Below everything already on the floor, with a metre between.
    const top = Math.max(
      0,
      ...[...next.units, ...next.spaces].map((piece) => piece.y + footprint(piece)[1]),
    );
    const y = layout ? top + 1 : 0;
    next = {
      ...next,
      width: Math.max(next.width, legacy.width),
      depth: Math.max(next.depth, y + legacy.depth),
      spaces: [...next.spaces, ...legacy.pieces.map((piece) => ({ ...piece, y: piece.y + y }))],
      parking: legacy.slots
        .filter((slot) => slot.slotId && onFloor.has(slot.slotId))
        .map((slot) => ({ ...slot, y: slot.y + y })),
    };
  }
  const placed = new Set(next.parking?.map((slot) => slot.slotId));
  return placeSlotsOnFloor(
    next,
    floorSlotIds.filter((id) => !placed.has(id)),
  );
}
