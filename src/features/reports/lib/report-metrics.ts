import { eachMonthOfInterval, format, parseISO } from "date-fns";

export function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export function reportMonth(month: string) {
  return format(parseISO(`${month}-01`), "MMM yyyy");
}

export function monthKeys(from: string, to: string): string[] {
  const start = parseISO(from);
  const end = parseISO(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (start > end) return [];
  return eachMonthOfInterval({ start, end }).map((month) => format(month, "yyyy-MM"));
}
