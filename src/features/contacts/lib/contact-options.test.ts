import { describe, expect, it } from "vitest";

import { ageOn } from "./contact-options";

describe("ageOn", () => {
  it("counts whole years", () => {
    expect(ageOn("1980-05-06", "2026-11-07")).toBe(46);
  });

  it("waits for the birthday", () => {
    expect(ageOn("1980-12-25", "2026-11-07")).toBe(45);
    expect(ageOn("1980-11-07", "2026-11-07")).toBe(46);
  });

  it("is null for a missing, malformed or future date", () => {
    expect(ageOn(null, "2026-11-07")).toBeNull();
    expect(ageOn("06/05/1980", "2026-11-07")).toBeNull();
    expect(ageOn("2030-01-01", "2026-11-07")).toBeNull();
  });
});
