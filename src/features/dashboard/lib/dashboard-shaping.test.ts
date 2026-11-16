import { expect, it } from "vitest";

import { rankPriorities, revenueSeries } from "./dashboard-shaping";

const now = new Date("2026-11-10T04:00:00Z");
const at = (iso: string | null) => (iso ? new Date(iso) : null);
const item = (id: string, dueAt: string | null, priority: string | null) => ({
  id,
  dueAt: at(dueAt),
  priority,
});

it("puts overdue work first, then the soonest due, then the most urgent", () => {
  const ranked = rankPriorities(
    [
      item("later", "2026-11-12T00:00:00Z", "urgent"),
      item("undated", null, "urgent"),
      item("overdue-low", "2026-11-01T00:00:00Z", "low"),
      item("soon-low", "2026-11-11T00:00:00Z", "low"),
      item("soon-high", "2026-11-11T00:00:00Z", "high"),
      item("overdue-older", "2026-10-01T00:00:00Z", "medium"),
    ],
    now,
  );
  expect(ranked.map((row) => row.id)).toEqual([
    "overdue-older",
    "overdue-low",
    "soon-high",
    "soon-low",
    "later",
    "undated",
  ]);
});

it("keeps at most the limit and treats unknown priorities as least urgent", () => {
  const ranked = rankPriorities(
    [item("odd", null, "whenever"), item("none", null, null), item("low", null, "low")],
    now,
    2,
  );
  expect(ranked.map((row) => row.id)).toEqual(["low", "odd"]);
});

it("lines up 11 months around this one, filling gaps with zero", () => {
  const series = revenueSeries(
    [{ month: "2026-10-01", value: "1500000" }],
    [{ month: "2027-01-01", value: 2000000 }],
    now,
  );
  expect(series).toHaveLength(11);
  expect(series[0].month).toBe("Jun 26");
  expect(series[5]).toEqual({ month: "Nov 26", closedSales: 0, forecast: 0 });
  expect(series[4]).toEqual({ month: "Oct 26", closedSales: 1500000, forecast: 0 });
  expect(series[7]).toEqual({ month: "Jan 27", closedSales: 0, forecast: 2000000 });
});
