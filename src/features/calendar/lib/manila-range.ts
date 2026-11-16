import { manilaMidnight } from "@/lib/utils/manila-time";

const DAY = 24 * 60 * 60 * 1000;

/** `yyyy-MM-dd` moved by `days` on the calendar. */
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
/** 0 = Sunday, matching the calendar grid. */
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * The instants a calendar view covers, by Manila's calendar whatever the server's zone: midnight
 * Manila to the midnight after. Weeks start on Sunday like the grid; a month spans its full weeks.
 */
export function manilaViewRange(
  view: "month" | "week" | "day" | "agenda",
  date: string,
): { start: Date; end: Date } {
  if (view === "day") return { start: manilaMidnight(date), end: manilaMidnight(addDays(date, 1)) };
  if (view === "week") {
    const first = addDays(date, -weekday(date));
    return { start: manilaMidnight(first), end: manilaMidnight(addDays(first, 7)) };
  }
  if (view === "month") {
    const first = `${date.slice(0, 7)}-01`;
    const [year, month] = first.split("-").map(Number);
    const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return {
      start: manilaMidnight(addDays(first, -weekday(first))),
      end: manilaMidnight(addDays(last, 7 - weekday(last))),
    };
  }
  const [year, month, day] = date.split("-").map(Number);
  const threeMonths = new Date(Date.UTC(year, month + 2, day)).toISOString().slice(0, 10);
  return { start: manilaMidnight(date), end: manilaMidnight(threeMonths) };
}
