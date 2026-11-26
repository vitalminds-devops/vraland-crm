"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { CalendarClock, Link2, MapPin, Pencil, Tag, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusMark } from "./response-mark";
import type { Invitee } from "../lib/event-access";
import { notify } from "@/components/ui/toast";
import { deleteCalendarEvent } from "../actions/calendar.actions";
import { respondToCalendarEvent } from "../actions/event-response.actions";
import { EVENT_COLORS, eventKind } from "../lib/event-colors";
import { contactName, ownerName, type CalendarEvent } from "../lib/event-types";
import { cn } from "@/lib/utils/cn";

/** Screen position for an anchored popover, computed at open time. */
export type PopoverPosition = { top: number; left: number };

/** Compute a clamped popover position from an anchor element's rectangle. */
export function popoverPositionFrom(
  anchor: HTMLElement,
  width = 320,
  height = 300,
): PopoverPosition {
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const top =
    rect.bottom + 8 + height > window.innerHeight
      ? Math.max(8, rect.top - height - 8)
      : rect.bottom + 8;
  return { top, left };
}

export function EventPopover({
  event,
  position,
  onClose,
  onEdit,
}: {
  event: CalendarEvent;
  position: PopoverPosition;
  onClose: () => void;
  /** Shown to people who may manage the calendar; the server checks the event is theirs. */
  onEdit?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [responding, startRespond] = useTransition();

  const respond = (response: "accepted" | "declined") =>
    startRespond(async () => {
      const result = await respondToCalendarEvent({ eventId: event.id, response, note: reason });
      if (result.success) {
        notify(response === "accepted" ? "Event accepted." : "Event declined.", "success");
        onClose();
      } else notify(result.error.message, "error");
    });

  const remove = () =>
    startDelete(async () => {
      const result = await deleteCalendarEvent(event.id);
      if (result.success) {
        notify(event.viewingId ? "Viewing deleted." : "Event deleted.", "success");
        onClose();
      } else notify(result.error.message, "error");
    });

  // Close on Escape / outside click.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  const colors = EVENT_COLORS[eventKind(event)];
  const owner = ownerName(event);
  // A viewing has an agent; an event has the people invited to it.
  const viewingAgent = event.viewingId
    ? [event.agentFirstName, event.agentLastName].filter(Boolean).join(" ") || owner
    : null;
  const invited = (event.invitees ?? []).filter((person) => person.userId !== event.ownerId);
  const contact = contactName(event);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${event.title} details`}
      style={position}
      className="fixed z-50 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-border/70 bg-popover p-4 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
    >
      <header className="flex items-start gap-3">
        <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", colors.dot)} />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug">{event.title}</h3>
          <span
            className={cn(
              "mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
              colors.chip,
            )}
          >
            {colors.label}
          </span>
        </div>
      </header>

      <dl className="mt-3 grid gap-2 text-[13px]">
        <Detail
          icon={CalendarClock}
          label="Time"
          value={
            event.allDay
              ? `${format(event.startAt, "EEE, MMM d")} · All day`
              : `${format(event.startAt, "EEE, MMM d \u00b7 h:mm a")} – ${format(event.endAt, "h:mm a")}`
          }
        />
        {contact ? (
          <Detail
            icon={User}
            label="Contact"
            value={contact}
            href={event.contactId ? `/contacts/${event.contactId}` : undefined}
            linkLabel="View contact"
          />
        ) : null}
        {event.propertyTitle ? (
          <Detail
            icon={Tag}
            label="Property"
            value={event.propertyTitle}
            href={event.propertyId ? `/properties/${event.propertyId}` : undefined}
          />
        ) : null}
        {event.location ? <Detail icon={MapPin} label="Location" value={event.location} /> : null}
        {viewingAgent ? <Detail icon={Link2} label="Agent" value={viewingAgent} /> : null}
        {!event.viewingId && owner ? <Detail icon={User} label="Created by" value={owner} /> : null}
      </dl>

      {invited.length ? (
        <section className="mt-3 grid gap-1.5 text-[13px]" aria-label="Invited">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Invited · {answerCounts(invited)}
          </p>
          <ul className="grid max-h-36 gap-1 overflow-y-auto pr-1">
            {invited.map((person) => (
              <li key={person.userId} className="flex items-start gap-2">
                <StatusMark status={person.status} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block truncate">{person.name}</span>
                  {person.status === "declined" && person.note ? (
                    <span className="block whitespace-pre-line text-[12px] text-muted-foreground">
                      {person.note}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {event.canRespond ? (
        <div className="mt-3 grid gap-2 border-t border-border/50 pt-3">
          {declining ? (
            <>
              <Textarea
                aria-label="Reason for declining"
                placeholder="Reason"
                value={reason}
                maxLength={500}
                rows={2}
                autoFocus
                onChange={(change) => setReason(change.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={responding}
                  onClick={() => setDeclining(false)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={responding || !reason.trim()}
                  onClick={() => respond("declined")}
                >
                  {responding ? "Declining…" : "Decline"}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex justify-end gap-2">
              {event.responseStatus === "declined" ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={responding}
                  onClick={() => setDeclining(true)}
                >
                  Decline
                </Button>
              )}
              {event.responseStatus === "accepted" ? null : (
                <Button
                  type="button"
                  size="sm"
                  disabled={responding}
                  onClick={() => respond("accepted")}
                >
                  {responding ? "Accepting…" : "Accept"}
                </Button>
              )}
            </div>
          )}
        </div>
      ) : null}

      {event.viewingId ? (
        <a
          href="/calendar/viewings"
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Viewing details
        </a>
      ) : null}

      {onEdit && (event.canEdit !== false || event.canDelete !== false) ? (
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-border/50 pt-3">
          {confirming ? (
            <>
              <span className="mr-auto text-[12px] text-muted-foreground">
                Delete {event.viewingId ? "this viewing" : "this event"}?
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleting}
                onClick={() => setConfirming(false)}
              >
                Keep
              </Button>
              <Button type="button" variant="danger" size="sm" disabled={deleting} onClick={remove}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </>
          ) : (
            <>
              {/* A viewing with an outcome on record is kept; the server refuses it too. */}
              {event.canDelete === false ||
              event.viewingStatus === "completed" ||
              event.viewingStatus === "no_show" ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Delete
                </Button>
              )}
              {event.canEdit === false ? null : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  onClick={onEdit}
                >
                  <Pencil className="size-3.5" aria-hidden />
                  Edit
                </Button>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  href,
  linkLabel,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="truncate text-foreground">{value}</dd>
        {href ? (
          <a href={href} className="text-[11px] font-medium text-primary hover:underline">
            {linkLabel ?? "Open"}
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** "3 accepted · 1 declined · 2 waiting", leaving out the zeros. */
function answerCounts(people: Invitee[]) {
  const count = (status: string) => people.filter((person) => person.status === status).length;
  return [
    [count("accepted"), "accepted"],
    [count("declined"), "declined"],
    [count("needs_action"), "waiting"],
  ]
    .filter(([n]) => n)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
}
