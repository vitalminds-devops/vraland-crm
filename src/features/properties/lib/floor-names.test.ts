import { expect, it } from "vitest";
import { parseFloorNames } from "./floor-names";

it("splits comma-typed floor names, dropping blanks and repeats", () => {
  expect(parseFloorNames(" Ground, Mezzanine,, roof , Roof ")).toEqual([
    "Ground",
    "Mezzanine",
    "roof",
  ]);
  expect(parseFloorNames(" , ")).toEqual([]);
});
