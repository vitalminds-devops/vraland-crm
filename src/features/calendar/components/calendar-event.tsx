"use client";

import { timeLabel } from "../lib/calendar-helpers";
import { EVENT_COLORS, eventKind } from "../lib/event-colors";
import { ownerName, type CalendarEvent } from "../lib/event-types";
import { cn } from "@/lib/utils/cn";

export function CalendarEventChip({
  event,
  onOpen,
  className,
  compact = false,
}: {
  event: CalendarEvent;
  onOpen?: (event: CalendarEvent, anchor: HTMLElement) => void;
  className?: string;
  compact?: boolean;
}) {
  const kind = eventKind(event);
  const colors = EVENT_COLORS[kind];
  const owner = ownerName(event);
  const label = `${timeLabel(event, "h:mm a")} ${event.title}${owner ? ` \u00b7 ${owner}` : ""}`;

  return (
    <button
      type="button"
      onClick={(e) => onOpen?.(event, e.currentTarget)}
      title={label}
      aria-label={label}
      className={cn(
        "group/chip flex w-full items-center gap-1.5 truncate rounded-md border-l-[3px] text-left",
        "px-1.5 py-1 text-[12px] leading-tight transition-colors duration-150",
        "hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "dark:hover:brightness-125",
        colors.chip,
        colors.accent,
        compact ? "text-[11px]" : "",
        className,
      )}
    >
      <span className="shrink-0 font-semibold tabular-nums">{timeLabel(event)}</span>
      <span className="truncate">{event.title}</span>
    </button>
  );
}
