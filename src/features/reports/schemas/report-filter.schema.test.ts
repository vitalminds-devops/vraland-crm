import { expect, it } from "vitest";
import { parseReportFilters } from "./report-filter.schema";

it("defaults to Manila's today, even before 8 AM Manila when UTC is still yesterday", () => {
  // 2026-11-10 06:30 in Manila is 2026-11-09 22:30 UTC.
  const filters = parseReportFilters({}, new Date("2026-11-09T22:30:00Z"));
  expect(filters).toMatchObject({ from: "2026-01-01", to: "2026-11-10" });
});

it("starts the year by Manila's calendar on New Year's morning", () => {
  // 2027-01-01 07:00 in Manila is still 2026-12-31 in UTC.
  expect(parseReportFilters({}, new Date("2026-12-31T23:00:00Z"))).toMatchObject({
    from: "2027-01-01",
    to: "2027-01-01",
  });
});

it("keeps chosen dates and swaps a reversed range", () => {
  expect(parseReportFilters({ from: "2026-05-01", to: "2026-02-01" })).toMatchObject({
    from: "2026-02-01",
    to: "2026-05-01",
  });
});

it("looks six months ahead from Manila's today for forecasts", () => {
  expect(parseReportFilters({}, new Date("2026-11-09T22:30:00Z"), "ahead")).toMatchObject({
    from: "2026-11-10",
    to: "2027-05-10",
  });
});
