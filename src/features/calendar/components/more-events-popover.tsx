"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { timeLabel } from "../lib/calendar-helpers";
import { EVENT_COLORS, eventKind } from "../lib/event-colors";
import { ownerName, type CalendarEvent } from "../lib/event-types";
import { popoverPositionFrom, type PopoverPosition } from "./event-popover";
import { cn } from "@/lib/utils/cn";
import { ResponseMark, declinedTitle } from "./response-mark";

export function MoreEventsPopover({
  date,
  events,
  hiddenCount,
  onSelect,
}: {
  date: Date;
  events: CalendarEvent[];
  hiddenCount: number;
  onSelect: (event: CalendarEvent, anchor: HTMLElement) => void;
}) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      )
        setPosition(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPosition(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setPosition(null);
          else setPosition(popoverPositionFrom(e.currentTarget, 288, 320));
        }}
        className="w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
      >
        +{hiddenCount} more
      </button>
      {position ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`All events on ${format(date, "MMMM d")}`}
          style={position}
          className="fixed z-50 w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-border/70 bg-popover p-2 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {format(date, "EEEE, MMM d")}
          </p>
          <ul className="mt-1 max-h-72 space-y-1 overflow-y-auto">
            {events.map((event) => {
              const colors = EVENT_COLORS[eventKind(event)];
              const owner = ownerName(event);
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      setPosition(null);
                      onSelect(event, e.currentTarget);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted"
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", colors.dot)} />
                    <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                      {timeLabel(event)}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate", declinedTitle(event))}>
                      {event.title}
                    </span>
                    <ResponseMark event={event} />
                    {owner ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground">{owner}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </>
  );
}
