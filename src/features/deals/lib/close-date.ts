import { manilaToday } from "@/lib/utils/manila-time";

/** An open opportunity whose expected close date (`yyyy-MM-dd`) is before today in Manila. Closed ones can't be late. */
export function isCloseDateOverdue(date: string | null, closed: boolean, today = manilaToday()) {
  return !closed && !!date && date < today;
}
