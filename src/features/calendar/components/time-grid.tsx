"use client";

import { useEffect, useState } from "react";
import { addDays, differenceInMinutes, format, isSameDay, startOfDay, startOfWeek } from "date-fns";
import { manilaWall, timeLabel } from "../lib/calendar-helpers";
import { EVENT_COLORS, eventKind } from "../lib/event-colors";
import { type CalendarEvent } from "../lib/event-types";
import { cn } from "@/lib/utils/cn";
import { ResponseMark, declinedTitle } from "./response-mark";

const START_HOUR = 7;
const END_HOUR = 20;
const SLOT_MINUTES = 30;
const HOUR_HEIGHT = 48; // px per hour

export function TimeGrid({
  date,
  events,
  singleDay = false,
  onOpenEvent,
}: {
  date: Date;
  events: CalendarEvent[];
  singleDay?: boolean;
  onOpenEvent: (event: CalendarEvent, anchor: HTMLElement) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const days = singleDay
    ? [startOfDay(date)]
    : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i));
  const slots: Date[] = [];
  for (let m = 0; m <= (END_HOUR - START_HOUR) * 60; m += SLOT_MINUTES) {
    const d = new Date(date);
    d.setHours(START_HOUR, m, 0, 0);
    slots.push(d);
  }

  return (
    <div className="max-h-[calc(100vh-320px)] overflow-auto">
      <div
        className={cn(
          "grid",
          singleDay ? "grid-cols-[64px_1fr]" : "grid-cols-[64px_repeat(7,1fr)]",
        )}
        style={{ minWidth: singleDay ? undefined : 760 }}
      >
        <div className="sticky top-0 z-20 border-b border-border/50 bg-card" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "sticky top-0 z-20 border-b border-l border-border/50 bg-card px-2 py-2 text-center",
              isSameDay(day, manilaWall(now)) && "bg-primary/[0.06]",
            )}
          >
            <p className="text-[12px] uppercase tracking-[0.5px] text-muted-foreground">
              {format(day, "EEE")}
            </p>
            <p
              className={cn(
                "mx-auto mt-0.5 grid size-6 place-items-center rounded-full text-[13px] font-semibold",
                isSameDay(day, manilaWall(now)) && "bg-primary text-primary-foreground",
              )}
            >
              {format(day, "d")}
            </p>
          </div>
        ))}

        <div className="sticky left-0 z-10 border-r border-border/40 bg-card">
          {slots.map((slot, i) => (
            <div
              key={i}
              className="relative border-b border-border/20 text-right"
              style={{ height: HOUR_HEIGHT / 2 }}
            >
              {slot.getMinutes() === 0 ? (
                <span className="absolute -top-2 right-1 text-[10px] tabular-nums text-muted-foreground">
                  {format(slot, "h a")}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(e.startAt, day));
          return (
            <div key={day.toISOString()} className="relative border-r border-border/40">
              {slots.map((slot) => (
                <div
                  key={slot.getTime()}
                  className="border-b border-border/20"
                  style={{ height: HOUR_HEIGHT / 2 }}
                />
              ))}
              <NowLine now={now} day={day} />
              {dayEvents.map((event) => (
                <PositionedEvent key={event.id} event={event} onOpen={onOpenEvent} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NowLine({ now, day }: { now: Date; day: Date }) {
  // `day` is in Manila wall time, so compare it with Manila's now, not the browser clock.
  const wall = manilaWall(now);
  if (!isSameDay(day, wall)) return null;
  const minutes = wall.getHours() * 60 + wall.getMinutes();
  const top = ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  if (top < 0 || top > (END_HOUR - START_HOUR) * HOUR_HEIGHT) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top }}>
      <div className="relative border-t-2 border-primary">
        <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-primary" />
      </div>
    </div>
  );
}

function PositionedEvent({
  event,
  onOpen,
}: {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent, anchor: HTMLElement) => void;
}) {
  const startMinutes = event.startAt.getHours() * 60 + event.startAt.getMinutes() - START_HOUR * 60;
  const duration = Math.max(differenceInMinutes(event.endAt, event.startAt), SLOT_MINUTES);
  const top = (startMinutes / 60) * HOUR_HEIGHT;
  const height = (duration / 60) * HOUR_HEIGHT;
  const colors = EVENT_COLORS[eventKind(event)];

  return (
    <button
      type="button"
      onClick={(e) => onOpen(event, e.currentTarget)}
      title={`${timeLabel(event)} ${event.title}`}
      style={{ top, height: Math.max(height - 2, 20) }}
      className={cn(
        "absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm",
        "transition-[filter] duration-150 hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:brightness-125",
        colors.chip,
        colors.accent,
      )}
    >
      <span className="flex items-center justify-between gap-1 font-semibold tabular-nums">
        {timeLabel(event)}
        <ResponseMark event={event} />
      </span>
      <span className={cn("block truncate", declinedTitle(event))}>{event.title}</span>
    </button>
  );
}
