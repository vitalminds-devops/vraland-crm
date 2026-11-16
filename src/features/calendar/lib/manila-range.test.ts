import { expect, it } from "vitest";
import { manilaViewRange } from "./manila-range";

const iso = (range: { start: Date; end: Date }) => [
  range.start.toISOString(),
  range.end.toISOString(),
];

it("covers a Manila day, early morning included", () => {
  expect(iso(manilaViewRange("day", "2026-11-12"))).toEqual([
    "2026-11-11T16:00:00.000Z",
    "2026-11-12T16:00:00.000Z",
  ]);
});

it("starts weeks on Sunday", () => {
  // 12 Nov 2026 is a Thursday.
  expect(iso(manilaViewRange("week", "2026-11-12"))).toEqual([
    "2026-11-07T16:00:00.000Z",
    "2026-11-14T16:00:00.000Z",
  ]);
});

it("spans a month's full weeks", () => {
  // November 2026 starts on a Sunday and ends on a Monday.
  expect(iso(manilaViewRange("month", "2026-11-12"))).toEqual([
    "2026-10-31T16:00:00.000Z",
    "2026-12-05T16:00:00.000Z",
  ]);
});
