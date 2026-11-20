"use client";

import { timeLabel } from "../lib/calendar-helpers";
import { EVENT_COLORS, eventKind } from "../lib/event-colors";
import { ownerName, responseLabel, type CalendarEvent } from "../lib/event-types";
import { ResponseMark, declinedTitle } from "./response-mark";
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
  const response = responseLabel(event);
  const label = `${timeLabel(event, "h:mm a")} ${event.title}${owner ? ` \u00b7 ${owner}` : ""}${response ? ` \u00b7 ${response}` : ""}`;

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
        compact
          ? "flex-col items-start gap-0.5 text-[11px] sm:flex-row sm:items-center sm:gap-1.5"
          : "",
        className,
      )}
    >
      <span className="shrink-0 font-semibold tabular-nums">{timeLabel(event)}</span>
      <span
        className={cn(
          compact
            ? "line-clamp-2 w-full whitespace-normal break-words sm:line-clamp-1 sm:w-auto sm:truncate"
            : "truncate",
          declinedTitle(event),
        )}
      >
        {event.title}
      </span>
      <ResponseMark event={event} className="sm:ml-auto" />
    </button>
  );
}
