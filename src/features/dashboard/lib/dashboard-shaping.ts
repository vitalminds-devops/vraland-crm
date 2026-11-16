import { format, parseISO } from "date-fns";

import { manilaDate, startOfManilaMonth } from "@/lib/utils/manila-time";

const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Overdue first, then the soonest due, then the most urgent; at most `limit` items. */
export function rankPriorities<T extends { dueAt: Date | null; priority: string | null }>(
  items: T[],
  now: Date,
  limit = 8,
): T[] {
  const overdue = (item: T) => (item.dueAt && item.dueAt < now ? 0 : 1);
  const due = (item: T) => item.dueAt?.getTime() ?? Infinity;
  const rank = (item: T) => priorityRank[item.priority ?? ""] ?? 4;
  return [...items]
    .sort((a, b) => overdue(a) - overdue(b) || due(a) - due(b) || rank(a) - rank(b))
    .slice(0, limit);
}

/** Closed sales and forecast for the 5 months before this one, this month and the 5 after. */
export function revenueSeries(
  closed: { month: string; value: unknown }[],
  forecast: { month: string; value: unknown }[],
  now: Date,
) {
  const byMonth = (rows: { month: string; value: unknown }[]) =>
    new Map(rows.map((row) => [String(row.month).slice(0, 7), Number(row.value ?? 0)]));
  const closedByMonth = byMonth(closed);
  const forecastByMonth = byMonth(forecast);
  return Array.from({ length: 11 }, (_, index) => {
    const key = manilaDate(startOfManilaMonth(now, index - 5)).slice(0, 7);
    return {
      month: format(parseISO(`${key}-01`), "MMM yy"),
      closedSales: closedByMonth.get(key) ?? 0,
      forecast: forecastByMonth.get(key) ?? 0,
    };
  });
}
