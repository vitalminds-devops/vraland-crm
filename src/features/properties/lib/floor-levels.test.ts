import { describe, expect, it } from "vitest";

import { floorLevelSequence, nextFloorLevel } from "./floor-levels";

describe("nextFloorLevel", () => {
  it("starts at 1 on an empty building", () => {
    expect(nextFloorLevel([])).toBe(1);
  });

  it("goes one above the top floor and skips level 4, as Generate does", () => {
    expect(nextFloorLevel([1, 2])).toBe(3);
    expect(nextFloorLevel([1, 2, 3])).toBe(5);
    expect(nextFloorLevel(floorLevelSequence(4))).toBe(6);
  });

  it("does not fill a removed floor's gap", () => {
    expect(nextFloorLevel([1, 3])).toBe(5);
  });
});
