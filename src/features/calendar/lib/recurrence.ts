export const REPEATS = ["none", "daily", "weekly", "monthly"] as const;
export type Repeat = (typeof REPEATS)[number];
export const MAX_OCCURRENCES = 52;

const MANILA = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** `instant` moved by `n` steps of Manila wall-clock time; a month step keeps the day, clamped to the month's end. */
function step(instant: Date, repeat: Repeat, n: number): Date {
  if (repeat === "daily") return new Date(instant.getTime() + n * DAY);
  if (repeat === "weekly") return new Date(instant.getTime() + n * 7 * DAY);
  if (repeat !== "monthly") return instant;
  const wall = new Date(instant.getTime() + MANILA);
  const month = wall.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(wall.getUTCFullYear(), month + 1, 0)).getUTCDate();
  wall.setUTCDate(1);
  wall.setUTCMonth(month);
  wall.setUTCDate(Math.min(new Date(instant.getTime() + MANILA).getUTCDate(), lastDay));
  return new Date(wall.getTime() - MANILA);
}

/** Every occurrence of an event, the first one included; each keeps the first one's length. */
export function occurrences(
  startAt: Date,
  endAt: Date,
  repeat: Repeat,
  count: number,
): { startAt: Date; endAt: Date }[] {
  const length = endAt.getTime() - startAt.getTime();
  const total = repeat === "none" ? 1 : Math.min(Math.max(count, 1), MAX_OCCURRENCES);
  return Array.from({ length: total }, (_, n) => {
    const start = step(startAt, repeat, n);
    return { startAt: start, endAt: new Date(start.getTime() + length) };
  });
}
