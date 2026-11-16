"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { RefObject } from "react";
import { DayCell } from "./day-cell";
import { EventPopover, popoverPositionFrom, type PopoverPosition } from "./event-popover";
import { TimeGrid } from "./time-grid";
import { CalendarAgenda } from "./calendar-agenda";
import { matchesFilter, type CalendarFilter } from "../lib/event-colors";
import type { CalendarEvent } from "../lib/event-types";
import { formatDate, shift, usePrefersReducedMotion } from "../lib/calendar-helpers";
import type { CalendarView as CalendarViewId } from "./calendar-toolbar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({
  date,
  view,
  events,
  basePath,
  activeFilter,
  canCreate,
  onAddOnDate,
  onEditEvent,
}: {
  date: Date;
  view: CalendarViewId;
  events: CalendarEvent[];
  basePath: string;
  activeFilter: CalendarFilter["id"];
  canCreate: boolean;
  onAddOnDate: (date: Date) => void;
  onEditEvent?: (event: CalendarEvent) => void;
}) {
  const router = useRouter();
  const [popover, setPopover] = useState<{
    event: CalendarEvent;
    position: PopoverPosition;
  } | null>(null);
  const [focusedDate, setFocusedDate] = useState<Date>(date);
  const gridRef = useRef<HTMLDivElement>(null);
  const reduceMotion = usePrefersReducedMotion();

  const filtered = useMemo(
    () => events.filter((e) => matchesFilter(e, activeFilter)),
    [events, activeFilter],
  );

  const navigate = useCallback(
    (next: Date, nextView?: CalendarViewId) => {
      const params = new URLSearchParams();
      params.set("date", formatDate(next));
      params.set("view", nextView ?? view);
      if (activeFilter !== "all") params.set("type", activeFilter);
      router.push(`${basePath}?${params.toString()}`);
    },
    [router, basePath, view, activeFilter],
  );

  // Keyboard shortcuts: T = today, arrows = prev/next, M/W/D/A = switch views.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case "t":
          navigate(new Date());
          break;
        case "arrowleft":
          navigate(shift(date, view, -1));
          break;
        case "arrowright":
          navigate(shift(date, view, 1));
          break;
        case "m":
          navigate(date, "month");
          break;
        case "w":
          navigate(date, "week");
          break;
        case "d":
          navigate(date, "day");
          break;
        case "a":
          navigate(date, "agenda");
          break;
        default:
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [date, view, navigate]);

  const openEvent = (event: CalendarEvent, anchor: HTMLElement) =>
    setPopover({ event, position: popoverPositionFrom(anchor) });

  const body =
    view === "month" ? (
      <MonthGrid
        date={date}
        events={filtered}
        focusedDate={focusedDate}
        gridRef={gridRef}
        canCreate={canCreate}
        onFocusDate={setFocusedDate}
        onAddOnDate={onAddOnDate}
        onOpenDay={(day) => navigate(day, "day")}
        onOpenEvent={openEvent}
      />
    ) : view === "week" ? (
      <TimeGrid date={date} events={filtered} onOpenEvent={openEvent} />
    ) : view === "day" ? (
      <TimeGrid date={date} events={filtered} singleDay onOpenEvent={openEvent} />
    ) : (
      <CalendarAgenda events={filtered} onOpenEvent={openEvent} />
    );

  return (
    <div className={`flex-1 bg-card ${reduceMotion ? "" : "animate-in fade-in-0 duration-150"}`}>
      {body}
      {popover ? (
        <EventPopover
          event={popover.event}
          position={popover.position}
          onClose={() => setPopover(null)}
          onEdit={
            canCreate && onEditEvent
              ? () => {
                  onEditEvent(popover.event);
                  setPopover(null);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

function MonthGrid({
  date,
  events,
  focusedDate,
  gridRef,
  canCreate,
  onFocusDate,
  onAddOnDate,
  onOpenDay,
  onOpenEvent,
}: {
  date: Date;
  events: CalendarEvent[];
  focusedDate: Date;
  gridRef: RefObject<HTMLDivElement | null>;
  canCreate: boolean;
  onFocusDate: (d: Date) => void;
  onAddOnDate: (d: Date) => void;
  onOpenDay: (d: Date) => void;
  onOpenEvent: (e: CalendarEvent, a: HTMLElement) => void;
}) {
  const start = startOfWeek(startOfMonth(date));
  const end = endOfWeek(endOfMonth(date));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  // Arrow keys move the focus ring between day cells (7 columns per row).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const delta =
      e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowLeft"
          ? -1
          : e.key === "ArrowDown"
            ? 7
            : e.key === "ArrowUp"
              ? -7
              : 0;
    if (!delta) return;
    e.preventDefault();
    const next = addDays(focusedDate, delta);
    onFocusDate(next);
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-day="${format(next, "yyyy-MM-dd")}"]`)
        ?.focus();
    });
  };

  return (
    <div className="overflow-x-auto" role="grid" aria-label={format(date, "MMMM yyyy")}>
      <div
        ref={gridRef}
        className="min-w-[320px] sm:min-w-[760px] focus:outline-none"
        onKeyDown={handleKeyDown}
      >
        <div role="row" className="grid grid-cols-7 border-b border-border/50 bg-muted/40">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              role="columnheader"
              className="px-2 py-2 text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => (
            <div key={day.toISOString()} data-day={format(day, "yyyy-MM-dd")}>
              <DayCell
                date={day}
                activeMonth={date}
                events={events.filter((e) => isSameDay(e.startAt, day))}
                isFocused={isSameDay(day, focusedDate)}
                onAddOnDate={canCreate ? onAddOnDate : undefined}
                onOpenEvent={onOpenEvent}
                onFocusDate={onFocusDate}
                onOpenDay={onOpenDay}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
