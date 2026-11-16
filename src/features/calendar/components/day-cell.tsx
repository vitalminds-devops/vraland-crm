"use client";

import { format, isSameMonth, isToday, isWeekend } from "date-fns";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CalendarEventChip } from "./calendar-event";
import { MoreEventsPopover } from "./more-events-popover";
import type { CalendarEvent } from "../lib/event-types";

const MAX_VISIBLE = 3;

export function DayCell({
  date,
  activeMonth,
  events,
  isFocused,
  onAddOnDate,
  onOpenEvent,
  onFocusDate,
  onOpenDay,
}: {
  date: Date;
  activeMonth: Date;
  events: CalendarEvent[];
  isFocused: boolean;
  onAddOnDate?: (date: Date) => void;
  onOpenEvent: (event: CalendarEvent, anchor: HTMLElement) => void;
  onFocusDate: (date: Date) => void;
  onOpenDay: (date: Date) => void;
}) {
  const inMonth = isSameMonth(date, activeMonth);
  const today = isToday(date);
  const weekend = isWeekend(date);
  const visible = events.slice(0, MAX_VISIBLE);
  const hidden = events.length - visible.length;

  return (
    <div
      role="gridcell"
      aria-selected={isFocused}
      aria-label={format(date, "EEEE, MMMM d, yyyy")}
      data-day={format(date, "yyyy-MM-dd")}
      tabIndex={isFocused ? 0 : -1}
      onFocus={() => onFocusDate(date)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (events.length === 1) onOpenEvent(events[0], e.currentTarget);
          else onOpenDay(date);
        }
      }}
      className={cn(
        "group/cell relative flex min-h-[84px] sm:min-h-[120px] min-w-0 flex-col gap-1 border-b border-r border-border/40 p-1 sm:p-1.5 transition-colors",
        inMonth ? "bg-card" : "bg-muted/20",
        weekend && inMonth && "bg-muted/30",
        today && "bg-primary/[0.06] dark:bg-primary/[0.12]",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "grid size-6 place-items-center rounded-full text-[13px] font-medium tabular-nums",
            !inMonth && "text-muted-foreground/50",
            today && "bg-primary text-primary-foreground",
          )}
        >
          {format(date, "d")}
        </span>
        {onAddOnDate ? (
          <button
            type="button"
            aria-label={`Add event on ${format(date, "MMMM d")}`}
            onClick={(e) => {
              e.stopPropagation();
              onAddOnDate(date);
            }}
            className={cn(
              "grid size-5 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity",
              "hover:bg-primary/10 hover:text-primary focus-visible:opacity-100",
              "group-hover/cell:opacity-100",
            )}
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Empty-area click target for quick creation */}
      {onAddOnDate ? (
        <div
          className="absolute inset-x-0 bottom-0 top-7 -z-0 cursor-pointer"
          aria-hidden
          onClick={() => onAddOnDate(date)}
        />
      ) : null}

      <div className="relative z-10 flex flex-col gap-1">
        {visible.map((event) => (
          <CalendarEventChip key={event.id} event={event} onOpen={onOpenEvent} compact />
        ))}
        {hidden > 0 ? (
          <MoreEventsPopover
            date={date}
            events={events}
            hiddenCount={hidden}
            onSelect={onOpenEvent}
          />
        ) : null}
      </div>
    </div>
  );
}
