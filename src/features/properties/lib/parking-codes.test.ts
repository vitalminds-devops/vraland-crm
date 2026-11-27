import { expect, it } from "vitest";
import { compareParkingCodes, nextParkingCode, nextSlotCode, slotRenames } from "./parking-codes";
import type { UnitIdentifier } from "./unit-identifier";

const letters: UnitIdentifier = { style: "letter", unitsPerFloor: 0, endings: [], skipFloors: [] };

it("numbers new parking slots after the ones taken", () => {
  expect(nextParkingCode([])).toBe("P1");
  expect(nextParkingCode(["P1", "P2"])).toBe("P3");
  expect(nextParkingCode(["P1", "P3"])).toBe("P4");
  expect(nextParkingCode(["P1", "Visitor"])).toBe("P3");
});

it("sorts slot names naturally", () => {
  expect(["P10", "P2", "P1"].sort(compareParkingCodes)).toEqual(["P1", "P2", "P10"]);
});

it("names parking by floor like the units when the property asks for it", () => {
  const byFloor = { ...letters, parking: "floor" as const };
  expect(nextSlotCode(letters, 2, ["P1"])).toBe("P2");
  expect(nextSlotCode(byFloor, 2, ["P2A"])).toBe("P2B");
  expect(nextSlotCode(byFloor, null, ["P2A"])).toBe("P2");
  expect(nextSlotCode({ ...byFloor, style: "custom", endings: ["01"] }, 3, [])).toBe("P301");
  expect(nextSlotCode({ ...byFloor, style: "number" }, 3, ["P301"])).toBe("P302");
});

it("renames slots in order, by floor or across the property", () => {
  const slots = [
    { id: "b", code: "P10" },
    { id: "a", code: "P2" },
  ];
  expect(slotRenames(slots, letters, 3)).toEqual([
    { id: "a", code: "P3A" },
    { id: "b", code: "P3B" },
  ]);
  // Across the property they keep the order given (floor by floor); P2 already fits.
  expect(slotRenames(slots, letters, null)).toEqual([{ id: "b", code: "P1" }]);
});
