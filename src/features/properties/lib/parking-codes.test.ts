import { expect, it } from "vitest";
import { compareParkingCodes, nextParkingCode } from "./parking-codes";

it("numbers new parking slots after the ones taken", () => {
  expect(nextParkingCode([])).toBe("P1");
  expect(nextParkingCode(["P1", "P2"])).toBe("P3");
  expect(nextParkingCode(["P1", "P3"])).toBe("P4");
  expect(nextParkingCode(["P1", "Visitor"])).toBe("P3");
});

it("sorts slot names naturally", () => {
  expect(["P10", "P2", "P1"].sort(compareParkingCodes)).toEqual(["P1", "P2", "P10"]);
});
