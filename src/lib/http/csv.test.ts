import { expect, it } from "vitest";
import { limitNote } from "./csv";

it("adds a note only when the export reached its cap", () => {
  expect(limitNote(9_999, 10_000)).toEqual([]);
  expect(limitNote(10_000, 10_000)[1][0]).toBe(
    "Only the first 10,000 rows were exported. Narrow the filters to export the rest.",
  );
});
