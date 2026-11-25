import { expect, it } from "vitest";
import { floorLayoutSchema, unitDesignSchema, unitTypeSchema } from "./floor-layout.schema";

const id = "88f50ab3-567a-4a37-9271-eaa92a221995";
const room = { id: "r1", kind: "bedroom", x: 0, y: 0, w: 3, h: 3.5, rotation: 0 };

it("accepts a design whose rooms fit inside the unit", () => {
  expect(unitDesignSchema.safeParse({ width: 8, depth: 6, rooms: [room] }).success).toBe(true);
  const outside = unitDesignSchema.safeParse({
    width: 8,
    depth: 6,
    rooms: [{ ...room, x: 6 }],
  });
  expect(outside.error?.issues[0]?.message).toBe(
    "Keep every room inside the unit; only a balcony may stick out.",
  );
  // Turned a quarter, the 3 × 3.5 bedroom is 3.5 wide, so it no longer fits at x = 5.
  const turned = { ...room, x: 5, rotation: 90 };
  expect(unitDesignSchema.safeParse({ width: 8, depth: 6, rooms: [turned] }).success).toBe(false);
});

it("lets only a balcony stick out past the walls", () => {
  const balcony = { id: "b1", kind: "balcony", x: 2, y: -1.5, w: 3, h: 1.5, rotation: 0 };
  expect(unitDesignSchema.safeParse({ width: 8, depth: 6, rooms: [balcony] }).success).toBe(true);
  const tooFar = { ...balcony, y: -3 };
  expect(unitDesignSchema.safeParse({ width: 8, depth: 6, rooms: [tooFar] }).success).toBe(false);
  const kitchenOutside = { ...balcony, kind: "kitchen" };
  expect(unitDesignSchema.safeParse({ width: 8, depth: 6, rooms: [kitchenOutside] }).success).toBe(
    false,
  );
});

it("reads a unit type's price from form text", () => {
  const parsed = unitTypeSchema.parse({
    propertyId: id,
    name: " 2 BR ",
    price: "",
    layout: { width: 8, depth: 6, rooms: [] },
  });
  expect(parsed).toMatchObject({ name: "2 BR", price: null });
});

it("refuses a floor that places the same unit twice", () => {
  const unit = {
    id: "p1",
    x: 0,
    y: 0,
    w: 8,
    h: 6,
    rotation: 0,
    typeId: id,
    unitId: id,
    flip: false,
  };
  const layout = { width: 40, depth: 16, units: [unit, { ...unit, id: "p2", x: 10 }], spaces: [] };
  expect(floorLayoutSchema.safeParse(layout).error?.issues[0]?.message).toBe(
    "A unit is placed twice.",
  );
  layout.units[1]!.unitId = null as unknown as string;
  expect(floorLayoutSchema.safeParse(layout).success).toBe(true);
});

it("keeps a name typed for a unit on the plan, and drops a blank one", () => {
  const unit = {
    id: "p1",
    x: 0,
    y: 0,
    w: 8,
    h: 6,
    rotation: 0,
    typeId: id,
    unitId: id,
    flip: false,
  };
  const parse = (code: string) =>
    floorLayoutSchema.safeParse({ width: 40, depth: 16, units: [{ ...unit, code }], spaces: [] });
  expect(parse(" 2B ").data?.units[0]?.code).toBe("2B");
  expect(parse("  ").data?.units[0]?.code).toBeUndefined();
  expect(parse("x".repeat(51)).success).toBe(false);
});
