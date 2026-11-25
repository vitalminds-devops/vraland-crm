import { expect, it } from "vitest";
import {
  copiedCode,
  designFacts,
  fitPlacements,
  withoutRemoved,
  footprint,
  formatArea,
  freeSpot,
  overlapping,
  placeWithin,
  REPRICED_STATUSES,
  copyGroupBeside,
  slotsByPosition,
  moveGroup,
  resolvePlacements,
  rotate,
  unitEnding,
  unitFacts,
  type LayoutItem,
} from "./floor-layout";

const piece = (id: string, x: number, y: number, w = 2, h = 1): LayoutItem => ({
  id,
  x,
  y,
  w,
  h,
  rotation: 0,
});

it("turns a piece around its centre and swaps its footprint", () => {
  const turned = rotate(piece("a", 2, 2, 4, 2));
  expect(turned.rotation).toBe(90);
  expect(footprint(turned)).toEqual([2, 4]);
  expect(turned).toMatchObject({ x: 3, y: 1 });
  expect(rotate(rotate(rotate(turned))).rotation).toBe(0);
});

it("keeps pieces on the grid and inside the canvas", () => {
  expect(placeWithin(piece("a", 9.3, -1), 10, 5)).toMatchObject({ x: 8, y: 0 });
  expect(placeWithin(piece("a", 1.26, 1.74), 10, 5)).toMatchObject({ x: 1.5, y: 1.5 });
  // A balcony may reach past the walls, but no further than its margin.
  expect(placeWithin(piece("a", 1, -4), 10, 5, 2.5)).toMatchObject({ x: 1, y: -2.5 });
});

it("finds overlapping pieces and a free spot for a new one", () => {
  const items = [piece("a", 0, 0), piece("b", 1, 0), piece("c", 2, 0)];
  expect([...overlapping(items)].sort()).toEqual(["a", "b", "c"]);
  expect(overlapping([piece("a", 0, 0), piece("b", 2, 0)]).size).toBe(0);
  expect(freeSpot([2, 1], [piece("a", 0, 0)], 10, 5)).toEqual({ x: 2, y: 0 });
});

it("reads a design's size and bedrooms", () => {
  const room = (kind: "bedroom" | "bathroom") => ({ ...piece(kind, 0, 0), kind });
  expect(designFacts({ width: 8, depth: 6.5, rooms: [room("bedroom"), room("bathroom")] })).toEqual(
    { floorArea: 52, bedrooms: 1 },
  );
});

it("keeps placed units, fills from unplaced ones, then numbers new ones", () => {
  const result = resolvePlacements({
    placements: [
      { id: "p1", unitId: "u2" },
      { id: "p2", unitId: null },
      { id: "p3", unitId: null },
    ],
    floorUnits: [
      { id: "u1", code: "301" },
      { id: "u2", code: "302" },
      { id: "u3", code: "303" },
    ],
    previouslyPlaced: ["u1", "u2"],
    nextCode: (taken) => ["301", "302", "303", "304"].find((code) => !taken.has(code)) ?? null,
  });
  expect(result).toEqual({
    assigned: [
      { placementId: "p1", unitId: "u2", code: "302" },
      { placementId: "p2", unitId: "u3", code: "303" },
      // 301 was removed from the plan, so its number is free again.
      { placementId: "p3", unitId: null, code: "301" },
    ],
    removed: ["u1"],
    full: false,
  });
});

it("matches copied units by code and stops when a floor is full", () => {
  const copied = resolvePlacements({
    placements: [
      { id: "p1", unitId: null, code: "502" },
      { id: "p2", unitId: null, code: "505" },
    ],
    floorUnits: [{ id: "u1", code: "502" }],
    previouslyPlaced: ["u1"],
    nextCode: () => null,
  });
  expect(copied.assigned).toEqual([
    { placementId: "p1", unitId: "u1", code: "502" },
    { placementId: "p2", unitId: null, code: "505" },
  ]);
  expect(copied.removed).toEqual([]);
  const full = resolvePlacements({
    placements: [{ id: "p1", unitId: null }],
    floorUnits: [],
    previouslyPlaced: [],
    nextCode: () => null,
  });
  expect(full.full).toBe(true);
});

it("uses the unit's own size and price before its type's", () => {
  const types = new Map([
    [
      "t",
      { id: "t", name: "Type A", bedrooms: 3, floorArea: "72", price: "9500000", layout: null },
    ],
  ]);
  expect(unitFacts({ unitTypeId: "t", floorArea: null, price: "9000000" }, types)).toEqual({
    typeName: "Type A",
    bedrooms: 3,
    floorArea: 72,
    price: 9000000,
  });
  expect(formatArea(72.5)).toBe("72.5 sqm");
  expect(unitEnding("303", 3)).toBe("03");
  expect(unitEnding("PH-1", 30)).toBe("PH-1");
});

it("numbers a copied unit for its new floor", () => {
  expect(copiedCode("303", 3, 12)).toBe("1203");
  expect(copiedCode("3B", 3, 5)).toBe("5B");
  expect(copiedCode("PH-1", 3, 5)).toBeNull();
});

it("never reprices reserved or sold units from their type", () => {
  expect(REPRICED_STATUSES).toContain("available");
  expect(REPRICED_STATUSES).not.toContain("deposit_paid");
  expect(REPRICED_STATUSES).not.toContain("sold");
});

it("gives placed units their type's current size, kept inside the floor", () => {
  const layout = {
    width: 20,
    depth: 10,
    units: [
      {
        id: "p",
        typeId: "t",
        unitId: null,
        flip: false,
        x: 0,
        y: 4,
        w: 8,
        h: 6,
        rotation: 0 as const,
      },
    ],
    spaces: [],
  };
  const fitted = fitPlacements(layout, new Map([["t", { width: 7, depth: 8, rooms: [] }]]));
  // 8 deep no longer fits from y = 4 on a 10 m floor, so it moves up to y = 2.
  expect(fitted.units[0]).toMatchObject({ w: 7, h: 8, x: 0, y: 2 });
  expect(fitPlacements(layout, {}).units[0]).toBe(layout.units[0]);
});

it("takes removed units and parking slots off the floor plan", () => {
  const spot = { x: 0, y: 0, w: 2, h: 2, rotation: 0 as const };
  const layout = {
    width: 20,
    depth: 10,
    units: [
      { id: "p1", typeId: "t", unitId: "u1", flip: false, ...spot },
      { id: "p2", typeId: "t", unitId: "u2", flip: false, ...spot },
    ],
    spaces: [],
    parking: [{ id: "s1", slotId: "a", ...spot }],
  };
  const next = withoutRemoved(layout, { unitIds: ["u1"], slotIds: ["a"] });
  expect(next.units.map((unit) => unit.unitId)).toEqual(["u2"]);
  expect(next.parking).toEqual([]);
});

it("never gives a new unit an identifier another piece on the plan is taking", () => {
  // The floor was renumbered on the plan: 1A and 1B are about to become 101 and 102.
  const result = resolvePlacements({
    placements: [
      { id: "a", unitId: "u1", code: "101" },
      { id: "b", unitId: "u2", code: "102" },
      { id: "new", unitId: null },
    ],
    floorUnits: [
      { id: "u1", code: "1A" },
      { id: "u2", code: "1B" },
    ],
    previouslyPlaced: ["u1", "u2"],
    nextCode: (taken) => ["101", "102", "103"].find((code) => !taken.has(code)) ?? null,
  });
  expect(result.assigned.find((entry) => entry.placementId === "new")?.code).toBe("103");
});

it("resizes slots placed as a parking type to the type's current size", () => {
  const spot = {
    id: "s1",
    x: 2,
    y: 2,
    w: 2.5,
    h: 5,
    rotation: 0 as const,
    slotId: null,
    typeId: "tandem",
  };
  const layout = {
    width: 30,
    depth: 20,
    units: [],
    spaces: [],
    parking: [spot, { ...spot, id: "s2", typeId: undefined }],
  };
  const fitted = fitPlacements(layout, {}, [{ id: "tandem", w: 2.5, h: 10 }]);
  expect(fitted.parking?.[0]).toMatchObject({ w: 2.5, h: 10 });
  // A plain slot, or one already the right size, is left as it is.
  expect(fitted.parking?.[1]).toBe(layout.parking[1]);
  expect(fitPlacements(fitted, {}, [{ id: "tandem", w: 2.5, h: 10 }]).parking?.[0]).toBe(
    fitted.parking?.[0],
  );
});

it("copies a piece beside itself at the same size, as a new one", () => {
  const slot = {
    id: "s1",
    x: 2,
    y: 0,
    w: 2.5,
    h: 5,
    rotation: 0 as const,
    slotId: "slot-1",
    code: "VIP",
  };
  // To its right, same size, no slot or typed name.
  expect(copyGroupBeside([slot], 30, 20, () => "s2")[0]).toMatchObject({
    id: "s2",
    x: 4.5,
    y: 0,
    w: 2.5,
    h: 5,
    slotId: null,
    code: undefined,
  });
  // No room on the right: below instead.
  expect(copyGroupBeside([{ ...slot, x: 27.5 }], 30, 20, () => "s3")[0]).toMatchObject({
    x: 27.5,
    y: 5,
  });
});

it("copies a group beside itself, keeping its arrangement", () => {
  let next = 0;
  const copies = copyGroupBeside([piece("a", 0, 0), piece("b", 2, 1)], 20, 10, () => `c${++next}`);
  // The group is 4 m wide, so the copies start 4 m to the right.
  expect(copies).toMatchObject([
    { id: "c1", x: 4, y: 0 },
    { id: "c2", x: 6, y: 1 },
  ]);
});

it("moves a group together and stops it at the edge without breaking formation", () => {
  const group = [piece("a", 1, 1), piece("b", 5, 3)];
  expect(moveGroup(group, 2, 1, 20, 10)).toMatchObject([
    { x: 3, y: 2 },
    { x: 7, y: 4 },
  ]);
  // b's right edge is at 7; on a 10 m canvas the group can only go 3 m right.
  expect(moveGroup(group, 8, 0, 10, 10)).toMatchObject([{ x: 4 }, { x: 8 }]);
  expect(moveGroup(group, -5, 0, 10, 10)).toMatchObject([{ x: 0 }, { x: 4 }]);
});

it("leaves a resized unit its own size", () => {
  const design = { width: 8, depth: 6, rooms: [] };
  const layout = {
    width: 40,
    depth: 16,
    spaces: [],
    units: [
      { ...piece("u", 0, 0, 10, 6), typeId: "t", unitId: null, flip: false, sized: true },
      { ...piece("v", 12, 0, 10, 6), typeId: "t", unitId: null, flip: false },
    ],
  };
  const [kept, fitted] = fitPlacements(layout, { t: design }).units;
  expect([kept!.w, fitted!.w]).toEqual([10, 8]);
});

it("pairs copied parking with the floor's own slots in plan order", () => {
  const spot = (id: string, x: number, y: number, slotId: string | null = null) => ({
    ...piece(id, x, y, 2.5, 5),
    slotId,
  });
  const kept = slotsByPosition(
    [spot("c", 0, 6), spot("a", 0, 0), spot("b", 3, 0)],
    [spot("y", 3, 0, "slot-2"), spot("x", 0, 0, "slot-1"), spot("z", 9, 9)],
  );
  // Two slots on the floor: the first two copies (top-left first) take them; the third is new.
  expect([...kept]).toEqual([
    ["a", "slot-1"],
    ["b", "slot-2"],
  ]);
});
