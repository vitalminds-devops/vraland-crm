import { Check, Clock3, X } from "lucide-react";
import type { AssignmentStatus } from "../lib/event-access";
import { RESPONSE_LABELS, type CalendarEvent } from "../lib/event-types";
import { cn } from "@/lib/utils/cn";

/** One answer at a glance: accepted, declined or still waiting. */
export function StatusMark({
  status,
  className,
}: {
  status: AssignmentStatus | string;
  className?: string;
}) {
  const known = (status in RESPONSE_LABELS ? status : "needs_action") as AssignmentStatus;
  const Icon = known === "accepted" ? Check : known === "declined" ? X : Clock3;
  return (
    <span
      title={RESPONSE_LABELS[known]}
      className={cn(
        "inline-flex shrink-0 items-center",
        known === "accepted"
          ? "text-emerald-600 dark:text-emerald-400"
          : known === "declined"
            ? "text-destructive"
            : "text-muted-foreground",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
      <span className="sr-only">{RESPONSE_LABELS[known]}</span>
    </span>
  );
}

/** The event's answer: the viewer's own when invited, else the group's. Nothing if no one else is invited. */
export function ResponseMark({ event, className }: { event: CalendarEvent; className?: string }) {
  if (event.viewingId || !event.responseStatus) return null;
  return <StatusMark status={event.responseStatus} className={className} />;
}

/** A declined event stays visible but reads as off. */
export const declinedTitle = (event: CalendarEvent) =>
  !event.viewingId && event.responseStatus === "declined" ? "line-through opacity-70" : "";
