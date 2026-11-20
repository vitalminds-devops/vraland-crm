import { describe, expect, it } from "vitest";

import {
  fromManilaDateTimeLocal,
  manilaDate,
  manilaDaysBetween,
  startOfManilaDay,
  startOfManilaMonth,
  startOfManilaWeek,
} from "./manila-time";

// 07:00 on 1 Nov in Manila is still 31 Oct in UTC.
const earlyFirst = new Date("2026-10-31T23:00:00Z");

describe("manila time", () => {
  it("dates an early-morning event on the Manila day", () => {
    expect(manilaDate(earlyFirst)).toBe("2026-11-01");
  });

  it("starts the day and month at Manila midnight", () => {
    expect(startOfManilaDay(earlyFirst).toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(startOfManilaMonth(earlyFirst).toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(startOfManilaMonth(earlyFirst, -1).toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });

  it("starts the week on Monday in Manila", () => {
    // 1 Nov 2026 is a Sunday, so the week began Monday 26 Oct.
    expect(manilaDate(startOfManilaWeek(earlyFirst))).toBe("2026-10-26");
  });
});

it("reads a datetime-local value as Manila time, whatever the server's zone", () => {
  expect(fromManilaDateTimeLocal("2026-11-10T09:00").toISOString()).toBe(
    "2026-11-10T01:00:00.000Z",
  );
  expect(fromManilaDateTimeLocal("2026-11-10T09:00:00Z").toISOString()).toBe(
    "2026-11-10T09:00:00.000Z",
  );
});

it("counts Manila calendar days, not UTC ones", () => {
  // 07:00 Manila on Nov 20 is still Nov 19 in UTC; 23:30 Manila on Nov 20 is the same Manila day.
  const morning = new Date("2026-11-19T23:00:00Z");
  expect(manilaDaysBetween(new Date("2026-11-20T15:30:00Z"), morning)).toBe(0);
  expect(manilaDaysBetween(new Date("2026-11-20T16:30:00Z"), morning)).toBe(1);
  expect(manilaDaysBetween(new Date("2026-11-19T15:59:00Z"), morning)).toBe(-1);
});
