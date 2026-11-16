"use client";

import { useSyncExternalStore } from "react";
import { addDays, addMonths, format } from "date-fns";
import type { CalendarEvent } from "./event-types";

/**
 * `date` moved so this browser's local clock reads Manila's: the calendar shows Manila time to
 * everyone, matching how its forms read times. For display only; never save the result.
 */
export const manilaWall = (date: Date) =>
  new Date(date.getTime() + (480 + date.getTimezoneOffset()) * 60_000);

/** The event's start time as shown, or "All day". */
export const timeLabel = (event: Pick<CalendarEvent, "allDay" | "startAt">, pattern = "HH:mm") =>
  event.allDay ? "All day" : format(event.startAt, pattern);

/** Format an anchor date for the URL (`yyyy-MM-dd`). */
export function formatDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Step a date by one unit of the active view (month/week/day). */
export function shift(date: Date, view: "month" | "week" | "day" | "agenda", delta: number): Date {
  if (view === "month") return addMonths(date, delta);
  if (view === "week") return addDays(date, delta * 7);
  return addDays(date, delta);
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}
