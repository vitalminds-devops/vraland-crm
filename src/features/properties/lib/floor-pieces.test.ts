import { expect, it } from "vitest";
import { type Piece, markSized, pieceName, refitType, toLayout, toPieces } from "./floor-pieces";

const unit = (id: string, extra: Partial<Piece> = {}): Piece => ({
  id,
  kind: "unit",
  typeId: "t",
  unitId: null,
  flip: false,
  x: 0,
  y: 0,
  w: 8,
  h: 6,
  rotation: 0,
  ...extra,
});
const design = { width: 10, depth: 6, rooms: [] };

it("splits pieces into units, parking and spaces and back", () => {
  const pieces: Piece[] = [
    unit("u"),
    { id: "s", kind: "slot", slotId: null, x: 10, y: 0, w: 2.5, h: 5, rotation: 0 },
    { id: "h", kind: "hallway", x: 0, y: 7, w: 20, h: 2, rotation: 0 },
  ];
  const layout = toLayout({ width: 30, depth: 10 }, pieces);
  expect([layout.units.length, layout.parking?.length, layout.spaces.length]).toEqual([1, 1, 1]);
  expect(toPieces(layout).map((piece) => piece.kind)).toEqual(["hallway", "unit", "slot"]);
});

it("marks a unit resized away from its type, and clears it when it matches again", () => {
  expect(markSized(unit("u"), design).sized).toBe(true);
  expect(markSized(unit("u", { w: 10, sized: true }), design).sized).toBeUndefined();
});

it("gives a redesigned type's units its new size, except ones resized on the plan", () => {
  const [plain, resized] = refitType(
    [unit("a"), unit("b", { x: 12, w: 4, sized: true })],
    "t",
    design,
    { width: 40, depth: 10 },
  );
  expect([plain!.w, resized!.w]).toEqual([10, 4]);
});

it("names pieces for the layers list", () => {
  expect(pieceName(unit("u"), "1A")).toBe("Unit 1A");
  expect(
    pieceName({ id: "h", kind: "hallway", x: 0, y: 0, w: 1, h: 1, rotation: 0 }, undefined),
  ).toBe("Hallway");
});
