import { expect, it } from "vitest";
import { emptyFloorSetup, floorSetupInput } from "./floor-setup-draft";

it("builds no floors until a floor is filled in", () => {
  expect(floorSetupInput(emptyFloorSetup)).toBeNull();
  // Half filled in still counts, so the form can say what is missing.
  expect(floorSetupInput({ ...emptyFloorSetup, fromLevel: "1" })?.toLevel).toBe(0);
  expect(
    floorSetupInput({ ...emptyFloorSetup, fromLevel: "1", toLevel: "10", skip: "4 13" }),
  ).toEqual({
    fromLevel: 1,
    toLevel: 10,
    skipFloors: [4, 13],
    style: "number",
    endings: ["01", "03", "05", "07", "09", "11", "15", "17"],
  });
});
