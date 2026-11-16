// Manila is UTC+8 all year (no daylight saving), so a fixed offset is exact.
const OFFSET = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const shifted = (date: Date) => new Date(date.getTime() + OFFSET);

/** The Manila calendar date of `date`, as `yyyy-MM-dd`. */
export function manilaDate(date = new Date()) {
  return shifted(date).toISOString().slice(0, 10);
}

export const manilaToday = () => manilaDate();

/** `date` as Manila wall-clock time, `yyyy-MM-ddTHH:mm` (the datetime-local input format). */
export const manilaDateTimeLocal = (date: Date) => shifted(date).toISOString().slice(0, 16);

/** A datetime-local value, Manila wall-clock time, as an instant. A value with its own zone keeps it. */
export const fromManilaDateTimeLocal = (value: string) =>
  new Date(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}+08:00`);

/** `date` as a readable Manila time, e.g. "Nov 10, 2026, 9:00 AM". */
export const manilaDateTime = (date: Date) =>
  date.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });

/** The instant a Manila calendar date (`yyyy-MM-dd`) begins. */
export const manilaMidnight = (date: string) => new Date(`${date}T00:00:00+08:00`);

/** The instant Manila's day containing `date` starts, `dayOffset` days later. */
export function startOfManilaDay(date = new Date(), dayOffset = 0) {
  const d = shifted(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset) - OFFSET,
  );
}

/** The instant Manila's month containing `date` starts, `monthOffset` months later. */
export function startOfManilaMonth(date = new Date(), monthOffset = 0) {
  const d = shifted(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset, 1) - OFFSET);
}

/** The instant Manila's week (Monday first) containing `date` starts. */
export function startOfManilaWeek(date = new Date()) {
  const daysSinceMonday = (shifted(date).getUTCDay() + 6) % 7;
  return new Date(startOfManilaDay(date).getTime() - daysSinceMonday * DAY);
}
