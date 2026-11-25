import type { ParkingType } from "./parking-types";

/**
 * Top-view layouts, measured in metres. A unit type has a design (its rooms); a floor has a
 * layout (designed units placed on it, plus shared spaces such as the hallway).
 */

export const roomKinds = [
  "bedroom",
  "bathroom",
  "kitchen",
  "living",
  "dining",
  "balcony",
  "closet",
  "foyer",
  "study",
  "laundry",
  "powder",
  "storage",
  "maids",
  "door",
] as const;
export type RoomKind = (typeof roomKinds)[number];

export const spaceKinds = [
  "hallway",
  "elevator",
  "stairs",
  "lobby",
  "utility",
  "driveway",
  "ramp",
  "pillar",
] as const;
/** The shared spaces that belong to parking, offered in the floor designer's Parking section. */
export const parkingSpaceKinds = ["driveway", "ramp", "pillar"] as const;
export type SpaceKind = (typeof spaceKinds)[number];

export const roomLabels: Record<RoomKind, string> = {
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  living: "Living",
  dining: "Dining",
  balcony: "Balcony",
  closet: "Closet",
  foyer: "Foyer",
  study: "Study",
  laundry: "Laundry",
  powder: "Powder room",
  storage: "Storage",
  maids: "Maid's room",
  door: "Door",
};

export const spaceLabels: Record<SpaceKind, string> = {
  hallway: "Hallway",
  elevator: "Elevator",
  stairs: "Stairs",
  lobby: "Lobby",
  utility: "Utility",
  driveway: "Drive path",
  ramp: "Ramp",
  pillar: "Pillar",
};

/** The size a piece takes when dropped, in metres. */
export const roomSizes: Record<RoomKind, [number, number]> = {
  bedroom: [3, 3.5],
  bathroom: [1.5, 2],
  kitchen: [2.5, 2],
  living: [3.5, 3],
  dining: [2.5, 2.5],
  balcony: [3, 1.5],
  closet: [1.5, 1],
  foyer: [1.5, 1.5],
  study: [2.5, 2.5],
  laundry: [1.5, 1.5],
  powder: [1.2, 1.5],
  storage: [1.5, 1.5],
  maids: [2, 2.5],
  door: [1, 1],
};

export const spaceSizes: Record<SpaceKind, [number, number]> = {
  hallway: [12, 2],
  elevator: [2, 2],
  stairs: [3, 2.5],
  lobby: [5, 4],
  utility: [2, 2],
  driveway: [10, 6],
  ramp: [3.5, 7],
  pillar: [0.5, 0.5],
};

export type Rotation = 0 | 90 | 180 | 270;

/** A piece on a canvas: `x`, `y` is its top-left corner on the canvas after rotating. */
export type LayoutItem = {
  id: string;
  x: number;
  y: number;
  /** Its own size before rotating. */
  w: number;
  h: number;
  rotation: Rotation;
};

/** A room in a unit type's design; `flip` mirrors it, such as a door swinging the other way. */
export type UnitRoom = LayoutItem & { kind: RoomKind; flip?: boolean };
/** A unit type's design: its outline and the rooms inside it. */
export type UnitDesign = { width: number; depth: number; rooms: UnitRoom[] };

export type FloorSpace = LayoutItem & { kind: SpaceKind };
/** A designed unit placed on a floor; `unitId` is empty until the floor is saved. */
export type UnitPlacement = LayoutItem & {
  typeId: string;
  unitId: string | null;
  flip: boolean;
  /** A name typed for it in the designer, applied to its unit on save. */
  code?: string;
  /** Resized on the plan: keeps its own size instead of its type's, its rooms stretched to fit. */
  sized?: boolean;
};
/** A parking slot placed on a floor; `slotId` is empty until the floor is saved. */
export type ParkingSpot = LayoutItem & {
  slotId: string | null;
  /** A name typed for it in the designer, applied to its slot on save. */
  code?: string;
  /** The parking type it was dragged in as; a new slot takes its price and reservation fee. */
  typeId?: string;
};
export type FloorLayout = {
  width: number;
  depth: number;
  units: UnitPlacement[];
  spaces: FloorSpace[];
  /** Parking slots on this floor, next to its units; missing on floors designed before parking. */
  parking?: ParkingSpot[];
};

export const GRID = 0.5;
export const MIN_PIECE = 0.5;
export const MAX_CANVAS = 200;
export const MAX_PIECES = 300;
export const defaultUnitDesign: UnitDesign = { width: 8, depth: 6, rooms: [] };
export const defaultFloorLayout: FloorLayout = { width: 40, depth: 16, units: [], spaces: [] };

export const snap = (value: number) => Math.round(value / GRID) * GRID;

/** The width and depth a piece takes on the canvas once rotated. */
export function footprint(item: Pick<LayoutItem, "w" | "h" | "rotation">): [number, number] {
  return item.rotation % 180 ? [item.h, item.w] : [item.w, item.h];
}

/** Keeps a piece inside the canvas, on the grid. */
/** Keeps a piece on its canvas; `margin` lets it reach that far past the edges. */
export function placeWithin<T extends LayoutItem>(
  item: T,
  width: number,
  depth: number,
  margin = 0,
): T {
  const [fw, fh] = footprint(item);
  const low = margin ? -margin : 0;
  return {
    ...item,
    x: Math.min(Math.max(low, snap(item.x)), Math.max(low, width + margin - fw)),
    y: Math.min(Math.max(low, snap(item.y)), Math.max(low, depth + margin - fh)),
  };
}

/** How far a balcony may stick out past the unit's outer walls, in metres. */
export const OVERHANG = 2.5;

/** A door isn't a room: it sits on a wall, over the rooms either side, with no walls of its own. */
export const isDoor = (kind: RoomKind) => kind === "door";

/** Balconies may sit outside the unit's walls; every other room stays inside. */
export const roomMargin = (kind: RoomKind) => (kind === "balcony" ? OVERHANG : 0);

/** The area a unit's drawing covers: its walls plus any balcony outside them. */
export function designBounds(design: UnitDesign): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  let x0 = 0;
  let y0 = 0;
  let x1 = design.width;
  let y1 = design.depth;
  for (const room of design.rooms) {
    const [fw, fh] = footprint(room);
    x0 = Math.min(x0, room.x);
    y0 = Math.min(y0, room.y);
    x1 = Math.max(x1, room.x + fw);
    y1 = Math.max(y1, room.y + fh);
  }
  return { x0, y0, x1, y1 };
}

export function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  const [aw, ah] = footprint(a);
  const [bw, bh] = footprint(b);
  const gap = 0.001;
  return (
    a.x + aw - gap > b.x && b.x + bw - gap > a.x && a.y + ah - gap > b.y && b.y + bh - gap > a.y
  );
}

/** The ids of pieces that sit on top of another piece. */
export function overlapping(items: readonly LayoutItem[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < items.length; i += 1)
    for (let j = i + 1; j < items.length; j += 1)
      if (overlaps(items[i]!, items[j]!)) ids.add(items[i]!.id).add(items[j]!.id);
  return ids;
}

/** A free spot for a new piece, scanning the canvas row by row; the top-left when it's full. */
export function freeSpot(
  size: [number, number],
  items: readonly LayoutItem[],
  width: number,
  depth: number,
): { x: number; y: number } {
  for (let y = 0; y + size[1] <= depth; y += GRID)
    for (let x = 0; x + size[0] <= width; x += GRID) {
      const probe = { id: "", x, y, w: size[0], h: size[1], rotation: 0 as const };
      if (!items.some((item) => overlaps(probe, item))) return { x, y };
    }
  return { x: 0, y: 0 };
}

/** Turns a piece a quarter clockwise around its centre, staying on the grid. */
export function rotate<T extends LayoutItem>(item: T): T {
  const [fw, fh] = footprint(item);
  const turned = { ...item, rotation: ((item.rotation + 90) % 360) as Rotation };
  const [nw, nh] = footprint(turned);
  return { ...turned, x: snap(item.x + (fw - nw) / 2), y: snap(item.y + (fh - nh) / 2) };
}

/** Units that take their type's price when it is saved; reserved and sold ones keep theirs. */
export const REPRICED_STATUSES = ["available", "inactive"] as const;

/** A design's size in square metres and its bedroom count. */
export function designFacts(design: UnitDesign): { floorArea: number; bedrooms: number } {
  return {
    floorArea: Number((design.width * design.depth).toFixed(2)),
    bedrooms: design.rooms.filter((room) => room.kind === "bedroom").length,
  };
}

/** How many of each room a design has (doors aren't rooms), in the order they first appear. */
export function roomCounts(design: UnitDesign): [RoomKind, number][] {
  const counts = new Map<RoomKind, number>();
  for (const room of design.rooms)
    if (!isDoor(room.kind)) counts.set(room.kind, (counts.get(room.kind) ?? 0) + 1);
  return [...counts];
}

/** "303" on level 3 -> "03"; a renamed unit that doesn't start with its level keeps its code. */
export function unitEnding(code: string, level: number): string {
  const prefix = String(level);
  return code.startsWith(prefix) && code.length > prefix.length ? code.slice(prefix.length) : code;
}

/**
 * Which of a floor's own slots each copied slot takes over, pairing them in plan order (top to
 * bottom, then left to right), so copying a layout keeps the slots already there with their
 * identifier, price and fee. Copied slots past the floor's count get none and become new slots.
 */
export function slotsByPosition(
  copied: readonly LayoutItem[],
  existing: readonly (LayoutItem & { slotId: string | null })[],
): Map<string, string> {
  const order = (a: LayoutItem, b: LayoutItem) => a.y - b.y || a.x - b.x;
  const own = existing.filter((spot) => spot.slotId).toSorted(order);
  return new Map(
    copied
      .toSorted(order)
      .slice(0, own.length)
      .map((spot, index) => [spot.id, own[index]!.slotId!]),
  );
}

/** A unit's number on another floor with the same layout: 303 -> 503; null for renamed units. */
export function copiedCode(code: string, fromLevel: number, toLevel: number): string | null {
  const ending = unitEnding(code, fromLevel);
  return ending === code ? null : `${toLevel}${ending}`;
}

/** Size and price shown for a unit: its own when set, else its type's. */
export function unitFacts(
  unit: { unitTypeId: string | null; floorArea: string | null; price: string | null },
  types: ReadonlyMap<string, UnitTypeFacts>,
): {
  typeName: string | null;
  bedrooms: number | null;
  floorArea: number | null;
  price: number | null;
} {
  const type = unit.unitTypeId ? types.get(unit.unitTypeId) : undefined;
  const number = (value: string | null | undefined) =>
    value === null || value === undefined || value === "" ? null : Number(value);
  return {
    typeName: type?.name ?? null,
    bedrooms: type?.bedrooms ?? null,
    floorArea: number(unit.floorArea) ?? number(type?.floorArea),
    price: number(unit.price) ?? number(type?.price),
  };
}

export type UnitTypeFacts = {
  id: string;
  name: string;
  bedrooms: number | null;
  floorArea: string | null;
  price: string | null;
  /** Per unit of this type; null (or missing) uses the property's. */
  reservationFee?: string | null;
  monthlyAmortization?: string | null;
  layout: UnitDesign | null;
};

/** "48" -> "48 sqm"; "72.5" -> "72.5 sqm". */
export function formatArea(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${Number(value.toFixed(2))} sqm`;
}

/**
 * Which unit each placed unit becomes when a floor is saved: its own unit, or the unit with the
 * code it asks for, else a unit already on the floor that was never placed, else a new unit with
 * the next free number. Units that were placed before and no longer are get removed.
 */
export function resolvePlacements(input: {
  placements: readonly { id: string; unitId: string | null; code?: string | null }[];
  /** Units on the floor now, in code order. */
  floorUnits: readonly { id: string; code: string }[];
  /** Unit ids placed in the floor's saved layout. */
  previouslyPlaced: readonly string[];
  nextCode: (taken: ReadonlySet<string>) => string | null;
}): {
  assigned: { placementId: string; unitId: string | null; code: string }[];
  removed: string[];
  full: boolean;
} {
  const byId = new Map(input.floorUnits.map((unit) => [unit.id, unit]));
  const byCode = new Map(input.floorUnits.map((unit) => [unit.code, unit]));
  const used = new Set<string>();
  // First the placements that name their unit, so nothing they keep is handed out twice.
  const matched = input.placements.map((placement) => {
    const unit =
      (placement.unitId ? byId.get(placement.unitId) : undefined) ??
      (placement.code ? byCode.get(placement.code) : undefined);
    if (!unit || used.has(unit.id)) return null;
    used.add(unit.id);
    return unit;
  });
  const placedBefore = new Set(input.previouslyPlaced);
  const removed = input.previouslyPlaced.filter((id) => byId.has(id) && !used.has(id));
  const gone = new Set(removed);
  const spare = input.floorUnits.filter((unit) => !used.has(unit.id) && !placedBefore.has(unit.id));
  const taken = new Set(input.floorUnits.filter((unit) => !gone.has(unit.id)).map((u) => u.code));
  const assigned: { placementId: string; unitId: string | null; code: string }[] = [];
  let full = false;
  // Identifiers typed for pieces on the plan (or a whole floor renumbered) are spoken for, so a
  // new unit never takes 101 while another piece is about to become 101.
  const reserved = input.placements.flatMap((placement) =>
    placement.code ? [placement.code] : [],
  );
  for (const [index, placement] of input.placements.entries()) {
    const unit =
      matched[index] ?? (placement.code ? undefined : spare.find((u) => !used.has(u.id)));
    if (unit) {
      used.add(unit.id);
      assigned.push({ placementId: placement.id, unitId: unit.id, code: unit.code });
      continue;
    }
    const code =
      placement.code && !taken.has(placement.code)
        ? placement.code
        : input.nextCode(new Set([...taken, ...reserved]));
    if (code === null) {
      full = true;
      break;
    }
    taken.add(code);
    assigned.push({ placementId: placement.id, unitId: null, code });
  }
  return { assigned, removed, full };
}

/**
 * A floor layout with every placed unit at its type's current size. A unit type redesigned
 * bigger or smaller keeps its spot on the floor but takes its new footprint, pulled back inside
 * the floor, so plans and the 3D view never draw a unit over a spot of the wrong size.
 */
export function fitPlacements(
  layout: FloorLayout,
  designs: ReadonlyMap<string, UnitDesign> | Readonly<Record<string, UnitDesign>>,
  /** Slots placed as a parking type take its current size too. */
  parkingTypes: readonly Pick<ParkingType, "id" | "w" | "h">[] = [],
): FloorLayout {
  const designOf = (typeId: string) =>
    designs instanceof Map ? designs.get(typeId) : (designs as Record<string, UnitDesign>)[typeId];
  const parkingTypeOf = new Map(parkingTypes.map((type) => [type.id, type]));
  return {
    ...layout,
    units: layout.units.map((unit) => {
      const design = designOf(unit.typeId);
      if (!design || unit.sized || (design.width === unit.w && design.depth === unit.h))
        return unit;
      return placeWithin({ ...unit, w: design.width, h: design.depth }, layout.width, layout.depth);
    }),
    ...(layout.parking && {
      parking: layout.parking.map((spot) => {
        const type = spot.typeId ? parkingTypeOf.get(spot.typeId) : undefined;
        if (!type || (type.w === spot.w && type.h === spot.h)) return spot;
        return placeWithin({ ...spot, w: type.w, h: type.h }, layout.width, layout.depth);
      }),
    }),
  };
}

/** A floor plan without the given units and parking slots, after they are removed. */
export function withoutRemoved(
  layout: FloorLayout,
  removed: { unitIds?: readonly string[]; slotIds?: readonly string[] },
): FloorLayout {
  const units = new Set(removed.unitIds ?? []);
  const slots = new Set(removed.slotIds ?? []);
  return {
    ...layout,
    units: layout.units.filter((unit) => !unit.unitId || !units.has(unit.unitId)),
    parking: (layout.parking ?? []).filter((slot) => !slot.slotId || !slots.has(slot.slotId)),
  };
}

/**
 * Copies of several pieces, keeping their arrangement, right beside the group (right, below, left
 * or above, whichever fits). Each copy is new: it keeps no unit, slot or typed name.
 */
export function copyGroupBeside<T extends LayoutItem>(
  pieces: readonly T[],
  width: number,
  depth: number,
  newId: () => string,
  marginOf: (piece: T) => number = () => 0,
): T[] {
  const box = groupBox(pieces);
  const margin = Math.min(...pieces.map(marginOf));
  const fits = (dx: number, dy: number) =>
    box.x0 + dx >= -margin &&
    box.y0 + dy >= -margin &&
    box.x1 + dx <= width + margin &&
    box.y1 + dy <= depth + margin;
  const [bw, bh] = [box.x1 - box.x0, box.y1 - box.y0];
  const [dx, dy] = (
    [
      [bw, 0],
      [0, bh],
      [-bw, 0],
      [0, -bh],
    ] as const
  ).find(([x, y]) => fits(x, y)) ?? [1, 1];
  return pieces.map((piece) =>
    placeWithin(
      {
        ...piece,
        x: piece.x + dx,
        y: piece.y + dy,
        id: newId(),
        ...("unitId" in piece ? { unitId: null } : {}),
        ...("slotId" in piece ? { slotId: null } : {}),
        ...("code" in piece ? { code: undefined } : {}),
      } as T,
      width,
      depth,
      marginOf(piece),
    ),
  );
}

/** The pieces moved together by (dx, dy), held back so none leaves the canvas and they keep formation. */
export function moveGroup<T extends LayoutItem>(
  pieces: readonly T[],
  dx: number,
  dy: number,
  width: number,
  depth: number,
  marginOf: (piece: T) => number = () => 0,
): T[] {
  let [minX, maxX, minY, maxY] = [-Infinity, Infinity, -Infinity, Infinity];
  for (const piece of pieces) {
    const [fw, fh] = footprint(piece);
    const margin = marginOf(piece);
    minX = Math.max(minX, -margin - piece.x);
    maxX = Math.min(maxX, width + margin - fw - piece.x);
    minY = Math.max(minY, -margin - piece.y);
    maxY = Math.min(maxY, depth + margin - fh - piece.y);
  }
  // Whole grid steps, so pieces on the grid stay on it; toward zero when a step would overshoot.
  const step = (value: number, low: number, high: number) => {
    const held = Math.min(high, Math.max(low, value));
    const snapped = snap(held);
    return snapped < low || snapped > high ? Math.trunc(held / GRID) * GRID : snapped;
  };
  const stepX = step(dx, minX, maxX);
  const stepY = step(dy, minY, maxY);
  return pieces.map((piece) => ({ ...piece, x: piece.x + stepX, y: piece.y + stepY }));
}

/** The box around some pieces' footprints. */
export function groupBox(pieces: readonly LayoutItem[]) {
  const boxes = pieces.map((piece) => {
    const [fw, fh] = footprint(piece);
    return { x0: piece.x, y0: piece.y, x1: piece.x + fw, y1: piece.y + fh };
  });
  return {
    x0: Math.min(...boxes.map((box) => box.x0)),
    y0: Math.min(...boxes.map((box) => box.y0)),
    x1: Math.max(...boxes.map((box) => box.x1)),
    y1: Math.max(...boxes.map((box) => box.y1)),
  };
}
