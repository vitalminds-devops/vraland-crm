"use client";

import { format } from "date-fns";
import { timeLabel } from "../lib/calendar-helpers";
import { CalendarX2, MapPin, User } from "lucide-react";
import { EVENT_COLORS, eventKind } from "../lib/event-colors";
import { contactName, ownerName, type CalendarEvent } from "../lib/event-types";
import { cn } from "@/lib/utils/cn";
import { ResponseMark, declinedTitle } from "./response-mark";

export function CalendarAgenda({
  events,
  onOpenEvent,
}: {
  events: CalendarEvent[];
  onOpenEvent: (event: CalendarEvent, anchor: HTMLElement) => void;
}) {
  if (!events.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CalendarX2 className="mb-3 size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No events in this period.</p>
      </div>
    );
  }

  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = format(event.startAt, "yyyy-MM-dd");
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }

  return (
    <div className="divide-y divide-border/50">
      {[...groups.entries()].map(([key, dayEvents]) => {
        const day = dayEvents[0].startAt;
        return (
          <section key={key}>
            <h3 className="sticky top-0 z-10 border-b border-border/50 bg-muted/40 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-foreground backdrop-blur">
              {format(day, "EEEE, MMMM d")}
            </h3>
            <ul>
              {dayEvents.map((event) => {
                const colors = EVENT_COLORS[eventKind(event)];
                const contact = contactName(event);
                const owner = ownerName(event);
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={(e) => onOpenEvent(event, e.currentTarget)}
                      className="group/row flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <time className="w-12 shrink-0 text-[13px] font-medium tabular-nums text-muted-foreground">
                        {timeLabel(event)}
                      </time>
                      <span className={cn("size-2.5 shrink-0 rounded-full", colors.dot)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[13px] font-medium">
                          <span className={cn("truncate", declinedTitle(event))}>
                            {event.title}
                          </span>
                          <ResponseMark event={event} />
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {contact ? (
                            <span className="inline-flex items-center gap-1">
                              <User className="size-3" />
                              {contact}
                            </span>
                          ) : null}
                          {event.propertyTitle ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" />
                              {event.propertyTitle}
                            </span>
                          ) : null}
                          {owner ? <span>{owner}</span> : null}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex",
                          colors.chip,
                        )}
                      >
                        {colors.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
