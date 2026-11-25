import { expect, it } from "vitest";
import {
  codeAt,
  floorRenames,
  floorCodes,
  floorLevels,
  nextFreeCode,
  nextLevel,
  parseEndings,
  parseFloorList,
  type UnitNumbering,
} from "./unit-numbering";

const custom: UnitNumbering = {
  style: "custom",
  unitsPerFloor: 0,
  endings: ["01", "03", "05", "07", "09", "11", "15", "17"],
  skipFloors: [],
};

it("numbers a custom floor from its endings, keeping floor 10 apart from floor 1", () => {
  expect(floorCodes(custom, 2, 99)).toEqual([
    "201",
    "203",
    "205",
    "207",
    "209",
    "211",
    "215",
    "217",
  ]);
  expect(codeAt(custom, 10, 1)).toBe("1001");
  expect(codeAt(custom, 10, 8)).toBe("1017");
  expect(codeAt(custom, 10, 9)).toBeNull();
});

it("numbers and letters a floor in sequence", () => {
  const number: UnitNumbering = { ...custom, style: "number", endings: [] };
  expect(floorCodes(number, 2, 3)).toEqual(["201", "202", "203"]);
  expect(codeAt(number, 10, 12)).toBe("1012");
  expect(floorCodes({ ...number, style: "letter" }, 2, 3)).toEqual(["2A", "2B", "2C"]);
});

it("fills the first free code and stops when a custom floor is full", () => {
  expect(nextFreeCode(custom, 2, new Set(["201", "203", "207"]))).toBe("205");
  expect(nextFreeCode(custom, 2, new Set(floorCodes(custom, 2, 99)))).toBeNull();
  const number: UnitNumbering = { ...custom, style: "number", endings: [] };
  expect(nextFreeCode(number, 3, new Set(["301", "302"]))).toBe("303");
});

it("skips the chosen floor levels", () => {
  expect(floorLevels(2, 6, [4])).toEqual([2, 3, 5, 6]);
  expect(floorLevels(11, 14, [13])).toEqual([11, 12, 14]);
  expect(nextLevel([10, 11, 12], [13])).toBe(14);
  expect(nextLevel([], [1])).toBe(2);
});

it("reads typed endings and floor lists", () => {
  expect(parseEndings("01, 03 05,, 03 a")).toEqual(["01", "03", "05", "A"]);
  expect(parseEndings("1-2 ok!")).toEqual([]);
  expect(parseFloorList("13, 4 4 x 0")).toEqual([4, 13]);
});

it("renames a floor's units to a numbering in their current order", () => {
  const numbers = { style: "number" as const, unitsPerFloor: 0, endings: [], skipFloors: [] };
  const units = [
    { id: "b", code: "2B" },
    { id: "a", code: "2A" },
    { id: "c", code: "2C" },
  ];
  expect(floorRenames(units, numbers, 2)).toEqual([
    { id: "a", code: "201" },
    { id: "b", code: "202" },
    { id: "c", code: "203" },
  ]);
  // Already matching: nothing to rename.
  expect(floorRenames([{ id: "a", code: "201" }], numbers, 2)).toEqual([]);
  // Custom endings that run out leave the floor alone.
  expect(floorRenames(units, { ...numbers, style: "custom", endings: ["01"] }, 2)).toBeNull();
});
