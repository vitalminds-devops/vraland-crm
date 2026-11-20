import type { CalendarEvent } from "./event-types";

export type EventKind = "viewing" | "follow_up" | "closing" | "meeting" | "general";

export type EventColorClasses = {
  /** Soft tinted chip background + readable text. */
  chip: string;
  /** Solid 3px left accent border colour (stronger tone). */
  accent: string;
  /** Small dot used in filters, legend and agenda rows. */
  dot: string;
  /** Short human label, e.g. "Viewing". */
  label: string;
};

export const EVENT_COLORS: Record<EventKind, EventColorClasses> = {
  viewing: {
    chip: "bg-brand-1/10 text-brand-1 dark:bg-brand-1/15",
    accent: "border-l-brand-1",
    dot: "bg-brand-1",
    label: "Viewing",
  },
  follow_up: {
    chip: "bg-brand-3/10 text-brand-3 dark:bg-brand-3/15",
    accent: "border-l-brand-3",
    dot: "bg-brand-3",
    label: "Follow-up",
  },
  closing: {
    chip: "bg-brand-2/10 text-brand-2 dark:bg-brand-2/15",
    accent: "border-l-brand-2",
    dot: "bg-brand-2",
    label: "Closing",
  },
  meeting: {
    chip: "bg-brand-4/12 text-brand-4 dark:bg-brand-4/15",
    accent: "border-l-brand-4",
    dot: "bg-brand-4",
    label: "Meeting",
  },
  general: {
    chip: "bg-muted text-muted-foreground",
    accent: "border-l-border",
    dot: "bg-muted-foreground/50",
    label: "Event",
  },
};

/** Map the persisted `eventType` value onto a visual kind. */
export function eventKind(event: Pick<CalendarEvent, "eventType" | "viewingId">): EventKind {
  if (event.viewingId) return "viewing";
  switch (event.eventType) {
    case "closing":
      return "closing";
    case "follow_up":
      return "follow_up";
    case "meeting":
    case "call":
      return "meeting";
    default:
      return "general";
  }
}

export function eventColor(
  event: Pick<CalendarEvent, "eventType" | "viewingId">,
): EventColorClasses {
  return EVENT_COLORS[eventKind(event)];
}

export type CalendarFilter = {
  id: "all" | "viewing" | "follow_up" | "closing";
  label: string;
  kind: EventKind | null;
};

export const CALENDAR_FILTERS: readonly CalendarFilter[] = [
  { id: "all", label: "All", kind: null },
  { id: "viewing", label: "Viewings", kind: "viewing" },
  { id: "follow_up", label: "Follow-ups", kind: "follow_up" },
  { id: "closing", label: "Closings", kind: "closing" },
] as const;

/** Does an event belong to a given filter id (excluding "all")? */
export function matchesFilter(
  event: Pick<CalendarEvent, "eventType" | "viewingId">,
  filterId: CalendarFilter["id"],
): boolean {
  if (filterId === "all") return true;
  return eventKind(event) === filterId;
}
