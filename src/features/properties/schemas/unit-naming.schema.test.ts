import { expect, it } from "vitest";
import { unitNamingSchema } from "./unit-naming.schema";

const propertyId = "88f50ab3-567a-4a37-9271-eaa92a221995";
const floorA = "7a1d3e3c-0f43-4c39-9d3f-4f0d7d8b1a01";
const floorB = "7a1d3e3c-0f43-4c39-9d3f-4f0d7d8b1a02";
const group = { id: "g1", name: " Tower A ", color: "teal", floorIds: [floorA] };

it("keeps named, coloured floor groups and needs endings for custom numbering", () => {
  const parsed = unitNamingSchema.parse({
    propertyId,
    style: "number",
    endings: [],
    floorGroups: [group],
  });
  expect(parsed.floorGroups?.[0]).toMatchObject({ name: "Tower A", color: "teal" });
  expect(
    unitNamingSchema.safeParse({ propertyId, style: "custom", endings: [], floorGroups: [] })
      .success,
  ).toBe(false);
});

it("refuses a floor in two groups, a group with no floors, or an unknown colour", () => {
  const parse = (floorGroups: unknown[]) =>
    unitNamingSchema.safeParse({ propertyId, style: "number", endings: [], floorGroups });
  expect(
    parse([group, { ...group, id: "g2", floorIds: [floorA, floorB] }]).error?.issues[0]?.message,
  ).toBe("A unit can be in one section only. Two sections on one floor need different units.");
  expect(parse([{ ...group, floorIds: [] }]).success).toBe(false);
  expect(parse([{ ...group, color: "gold" }]).success).toBe(false);
});

it("lets an odd and an even section share a floor", () => {
  const sunrise = { ...group, id: "g2", name: "Sunrise", side: "even" };
  const sunset = { ...group, id: "g3", name: "Sunset", side: "odd" };
  const parse = (floorGroups: unknown[]) =>
    unitNamingSchema.safeParse({ propertyId, style: "number", endings: [], floorGroups });
  expect(parse([sunrise, sunset]).success).toBe(true);
  expect(parse([sunrise, { ...sunset, side: "even" }]).success).toBe(false);
  expect(parse([sunrise, { ...sunset, side: "all" }]).success).toBe(false);
});

it("needs picked units for a pick section, and lets picks share a floor apart", () => {
  const parse = (floorGroups: unknown[]) => unitNamingSchema.safeParse({ propertyId, floorGroups });
  const garden = { ...group, id: "g4", name: "Garden", side: "pick", endings: ["A", "B"] };
  expect(parse([{ ...garden, endings: [] }]).success).toBe(false);
  expect(parse([garden, { ...garden, id: "g5", endings: ["C"] }]).success).toBe(true);
  expect(parse([garden, { ...garden, id: "g5", endings: ["B"] }]).success).toBe(false);
});

it("accepts the section ids migration 0070 made from old side names", () => {
  const evenSide = { ...group, id: `even-${propertyId}` };
  expect(evenSide.id.length).toBe(41);
  expect(
    unitNamingSchema.safeParse({
      propertyId,
      style: "number",
      endings: [],
      floorGroups: [evenSide],
    }).success,
  ).toBe(true);
});
