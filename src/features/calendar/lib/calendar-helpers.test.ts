import { expect, it } from "vitest";
import { manilaWall, timeLabel } from "./calendar-helpers";

it("shows an instant at Manila's clock time whatever the browser's zone", () => {
  // 01:00 UTC is 09:00 in Manila.
  const wall = manilaWall(new Date("2026-11-12T01:00:00Z"));
  expect([wall.getHours(), wall.getMinutes()]).toEqual([9, 0]);
});

it("labels all-day events instead of giving them a clock time", () => {
  expect(timeLabel({ allDay: true, startAt: new Date(2026, 10, 12, 9, 30) })).toBe("All day");
  expect(timeLabel({ allDay: false, startAt: new Date(2026, 10, 12, 9, 30) })).toBe("09:30");
});
