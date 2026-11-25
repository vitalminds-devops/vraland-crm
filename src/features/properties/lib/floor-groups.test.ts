import { expect, it } from "vitest";
import {
  groupOfUnit,
  sectionsOfFloor,
  unitEndings,
  sidesOverlap,
  unitParity,
  type FloorGroup,
} from "./floor-groups";

const groups: FloorGroup[] = [
  { id: "a", name: "Tower A", color: "teal", floorIds: ["f1"] },
  { id: "b", name: "Sunrise", color: "orange", floorIds: ["f2"], side: "even" },
  { id: "c", name: "Sunset", color: "violet", floorIds: ["f2"], side: "odd" },
  { id: "d", name: "Garden", color: "green", floorIds: ["f3"], side: "pick", endings: ["A", "B"] },
];
const floor = (id: string, level: number) => ({ id, level });

it("reads odd and even from a unit's number or letter", () => {
  expect([unitParity("201"), unitParity("202"), unitParity("2A"), unitParity("2B")]).toEqual([
    "odd",
    "even",
    "odd",
    "even",
  ]);
  expect(unitParity("PH-")).toBeNull();
});

it("finds a unit's section by floor and side, or by picked ending, with its colour", () => {
  expect(groupOfUnit(groups, floor("f1", 1), "101")).toEqual({ name: "Tower A", hex: "#0f766e" });
  expect(groupOfUnit(groups, floor("f2", 2), "204")?.name).toBe("Sunrise");
  expect(groupOfUnit(groups, floor("f2", 2), "2C")?.name).toBe("Sunset");
  expect(groupOfUnit(groups, floor("f3", 3), "3B")?.name).toBe("Garden");
  expect(groupOfUnit(groups, floor("f3", 3), "3C")).toBeNull();
  expect(groupOfUnit(null, floor("f1", 1), "101")).toBeNull();
});

it("knows when two sections would both take a unit on a shared floor", () => {
  expect(sidesOverlap({ side: "odd" }, { side: "even" })).toBe(false);
  expect(sidesOverlap({ side: "odd" }, { side: "odd" })).toBe(true);
  expect(sidesOverlap({}, { side: "even" })).toBe(true);
  expect(sidesOverlap({ side: "pick", endings: ["A", "C"] }, { side: "even" })).toBe(false);
  expect(sidesOverlap({ side: "pick", endings: ["A", "B"] }, { side: "even" })).toBe(true);
  expect(sidesOverlap({ side: "pick", endings: ["A"] }, { side: "pick", endings: ["B"] })).toBe(
    false,
  );
});

it("lists a floor's sections in their colours", () => {
  expect(sectionsOfFloor(groups, "f2").map((section) => section.name)).toEqual([
    "Sunrise",
    "Sunset",
  ]);
  expect(sectionsOfFloor(groups, "f1")).toEqual([{ name: "Tower A", hex: "#0f766e" }]);
  expect(sectionsOfFloor(undefined, "f1")).toEqual([]);
});

it("lists every unit ending once, in natural order", () => {
  const floors = [
    { id: "f2", level: 2 },
    { id: "f10", level: 10 },
  ];
  expect(
    unitEndings(
      [
        { code: "2B", floorId: "f2" },
        { code: "2A", floorId: "f2" },
        { code: "10A", floorId: "f10" },
        { code: "PH-1", floorId: "f10" },
      ],
      floors,
    ),
  ).toEqual(["A", "B", "PH-1"]);
  expect(
    unitEndings(
      [
        { code: "1003", floorId: "f10" },
        { code: "202", floorId: "f2" },
      ],
      floors,
    ),
  ).toEqual(["02", "03"]);
});
