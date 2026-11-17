import { addMonths, format, isAfter, isValid, parseISO } from "date-fns";
import { z } from "zod";

import { manilaDate } from "@/lib/utils/manila-time";

const optionalId = z.string().uuid().optional().catch(undefined);
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

const reportFilterSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  agent: optionalId,
  development: optionalId,
  propertyType: z.string().trim().max(50).optional().catch(undefined),
});

export type ReportFilters = z.infer<typeof reportFilterSchema> & { from: string; to: string };

/**
 * `past` defaults to this year so far, for what happened; `ahead` to today and the next six months,
 * for what is expected to close.
 */
export function parseReportFilters(
  input: Record<string, string | string[] | undefined>,
  now = new Date(),
  horizon: "past" | "ahead" = "past",
): ReportFilters {
  const parsed = reportFilterSchema.parse(
    Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
    ),
  );
  // Manila's calendar, not the server's: on a UTC server it is still "yesterday" until 8 AM Manila.
  const today = manilaDate(now);
  const defaultFrom = horizon === "ahead" ? today : `${today.slice(0, 4)}-01-01`;
  const defaultTo =
    horizon === "ahead" ? format(addMonths(parseISO(today), 6), "yyyy-MM-dd") : today;
  const from = parsed.from && isValid(parseISO(parsed.from)) ? parsed.from : defaultFrom;
  const to = parsed.to && isValid(parseISO(parsed.to)) ? parsed.to : defaultTo;
  return isAfter(parseISO(from), parseISO(to))
    ? { ...parsed, from: to, to: from }
    : { ...parsed, from, to };
}
