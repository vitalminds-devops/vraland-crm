import { expect, it } from "vitest";
import { occurrences } from "./recurrence";

const at = (iso: string) => new Date(`${iso}+08:00`);
const starts = (list: { startAt: Date }[]) => list.map((o) => o.startAt.toISOString());

it("returns just the event when it does not repeat", () => {
  expect(occurrences(at("2026-11-10T09:00"), at("2026-11-10T10:00"), "none", 5)).toHaveLength(1);
});

it("repeats weekly at the same Manila time, keeping the length", () => {
  const list = occurrences(at("2026-11-10T09:00"), at("2026-11-10T10:30"), "weekly", 3);
  expect(starts(list)).toEqual([
    "2026-11-10T01:00:00.000Z",
    "2026-11-17T01:00:00.000Z",
    "2026-11-24T01:00:00.000Z",
  ]);
  expect(list[2].endAt.getTime() - list[2].startAt.getTime()).toBe(90 * 60 * 1000);
});

it("repeats monthly on the same day, clamped to short months", () => {
  const list = occurrences(at("2026-01-31T07:00"), at("2026-01-31T08:00"), "monthly", 3);
  expect(starts(list)).toEqual([
    "2026-01-30T23:00:00.000Z",
    "2026-02-27T23:00:00.000Z",
    "2026-03-30T23:00:00.000Z",
  ]);
});

it("caps a series at 52 occurrences", () => {
  expect(occurrences(at("2026-11-10T09:00"), at("2026-11-10T10:00"), "daily", 500)).toHaveLength(
    52,
  );
});
