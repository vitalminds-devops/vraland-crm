"use client";

import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { CalendarPlus, Pencil, X } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { manilaDateTimeLocal } from "@/lib/utils/manila-time";

import { createCalendarEvent, updateCalendarEvent } from "../actions/calendar.actions";
import { eventColor } from "../lib/event-colors";
import type { CalendarEvent } from "../lib/event-types";
import { manilaWall } from "../lib/calendar-helpers";
import { MAX_OCCURRENCES, type Repeat } from "../lib/recurrence";

type Person = { id: string; firstName: string; lastName: string | null };

/** The persisted values; `call` is folded into the Meeting colour by `eventColor`. */
const EVENT_TYPES = ["general", "meeting", "call", "closing", "follow_up"];

const field =
  "h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-border focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25";

const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const label = (v: string) => v.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

/** `yyyy-MM-ddTHH:mm` for a datetime-local input, prefilled to 10:00 on `date`. */
function defaultSlot(date?: Date) {
  const d = date ? new Date(date) : manilaWall(new Date());
  if (date) d.setHours(10, 0, 0, 0);
  return {
    start: format(d, "yyyy-MM-dd'T'HH:mm"),
    end: format(new Date(d.getTime() + 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm"),
  };
}

export function EventForm({
  agents,
  defaultType = "general",
  defaultDate,
  open: controlledOpen,
  onOpenChange,
  trigger = true,
  event,
}: {
  agents: Person[];
  /** The event to edit; without one the form adds a new event. */
  event?: CalendarEvent | null;
  defaultType?: string;
  defaultDate?: Date;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [pending, start] = useTransition();
  const isViewing = Boolean(event?.viewingId);
  const [eventType, setEventType] = useState(event?.eventType ?? defaultType);
  const [repeat, setRepeat] = useState<Repeat>("none");
  // Times are edited as Manila wall-clock time, which is how the server reads them.
  const slot = event
    ? {
        start: manilaDateTimeLocal(new Date(event.startAt)),
        end: manilaDateTimeLocal(new Date(event.endAt)),
      }
    : defaultSlot(defaultDate);
  const preview = eventColor({ eventType, viewingId: event?.viewingId ?? null });

  const submit = (form: HTMLFormElement) => {
    const f = new FormData(form);
    start(async () => {
      if (event) {
        const r = await updateCalendarEvent({
          id: event.id,
          title: f.get("title"),
          description: f.get("description"),
          eventType: isViewing ? undefined : f.get("eventType"),
          startAt: f.get("startAt"),
          endAt: f.get("endAt"),
          allDay: f.get("allDay") === "on",
          location: f.get("location"),
        });
        if (r.success) {
          setOpen(false);
          notify("Event updated.", "success");
        } else notify(r.error.message, "error");
        return;
      }
      const r = await createCalendarEvent({
        title: f.get("title"),
        description: f.get("description"),
        eventType: f.get("eventType"),
        startAt: f.get("startAt"),
        endAt: f.get("endAt"),
        allDay: f.get("allDay") === "on",
        location: f.get("location"),
        contactId: "",
        propertyId: "",
        dealId: "",
        attendeeUserId: f.get("attendeeUserId"),
        repeat,
        repeatCount: repeat === "none" ? 1 : f.get("repeatCount"),
      });
      if (r.success) {
        setOpen(false);
        notify("Event created.", "success");
      } else notify(r.error.message, "error");
    });
  };

  return (
    <>
      {trigger ? (
        <Button variant="secondary" className="gap-2" onClick={() => setOpen(true)}>
          <CalendarPlus className="size-4" />
          Add event
        </Button>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !pending) {
            setOpen(false);
          }
        }}
      >
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
            <DialogPopup className="w-full max-w-3xl rounded-xl border border-border/60 bg-card shadow-2xl">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(e.currentTarget);
                }}
                className="flex max-h-[calc(100dvh-2rem)] flex-col"
              >
                <header className="flex items-start justify-between gap-4 border-b border-border/50 p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-full",
                        preview.chip,
                      )}
                    >
                      {event ? <Pencil className="size-4" /> : <CalendarPlus className="size-4" />}
                    </span>
                    <div className="min-w-0">
                      <DialogTitle className="text-base leading-tight font-semibold text-foreground">
                        {event ? (isViewing ? "Edit viewing" : "Edit event") : "Add event"}
                      </DialogTitle>
                      <DialogDescription className="mt-0.5 text-[13px] text-muted-foreground">
                        {event ? "Change the details or move it." : "Block time on the calendar."}
                      </DialogDescription>
                    </div>
                  </div>
                  <DialogClose
                    aria-label="Close"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border/60 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:outline-none"
                  >
                    <X aria-hidden="true" size={16} />
                  </DialogClose>
                </header>

                <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6">
                  <Field label="Event title" className="sm:col-span-2">
                    <Input
                      required
                      name="title"
                      autoFocus
                      defaultValue={event?.title}
                      placeholder="What is happening?"
                      className={field}
                    />
                  </Field>

                  <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2" hidden={isViewing}>
                    <Field label="Type">
                      <NativeSelect
                        name="eventType"
                        value={eventType}
                        onChange={(e) => setEventType(e.target.value)}
                        className={field}
                      >
                        {EVENT_TYPES.map((v) => (
                          <NativeSelectOption key={v} value={v}>
                            {label(v)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="On the calendar">
                      <span
                        className={cn(
                          "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium",
                          preview.chip,
                        )}
                      >
                        <span
                          className={cn("size-2 rounded-full", preview.dot)}
                          aria-hidden="true"
                        />
                        {label(eventType)}
                      </span>
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                    <Field label="Starts">
                      <DatePicker
                        type="datetime-local"
                        required
                        name="startAt"
                        defaultValue={slot.start}
                        className={cn(field, "pr-2")}
                      />
                    </Field>
                    <Field label="Ends">
                      <DatePicker
                        type="datetime-local"
                        required
                        name="endAt"
                        defaultValue={slot.end}
                        className={cn(field, "pr-2")}
                      />
                    </Field>
                  </div>

                  <Field label="Location" hint="Optional">
                    <Input
                      name="location"
                      defaultValue={event?.location ?? ""}
                      placeholder="Address, room, or meeting link"
                      className={field}
                    />
                  </Field>

                  {event ? null : (
                    <>
                      <Field label="Repeats">
                        <NativeSelect
                          name="repeat"
                          value={repeat}
                          onChange={(e) => setRepeat(e.target.value as Repeat)}
                          className={cn(field, "pr-9")}
                        >
                          {REPEAT_OPTIONS.map((option) => (
                            <NativeSelectOption key={option.value} value={option.value}>
                              {option.label}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>

                      <Field label="Times" hint={`Up to ${MAX_OCCURRENCES}`}>
                        <Input
                          type="number"
                          name="repeatCount"
                          min={2}
                          max={MAX_OCCURRENCES}
                          defaultValue={4}
                          required={repeat !== "none"}
                          disabled={repeat === "none"}
                          className={field}
                        />
                      </Field>

                      <Field label="Agent">
                        <NativeSelect name="attendeeUserId" className={cn(field, "pr-9")}>
                          <NativeSelectOption value="">Assign to me</NativeSelectOption>
                          {agents.map((v) => (
                            <NativeSelectOption key={v.id} value={v.id}>
                              {`${v.firstName} ${v.lastName ?? ""}`.trim()}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                    </>
                  )}

                  <Field label="Notes" hint="Optional" className="sm:col-span-2">
                    <Textarea
                      name="description"
                      defaultValue={event?.description ?? ""}
                      rows={3}
                      placeholder="Notes"
                      className={cn(field, "h-auto py-2 leading-relaxed")}
                    />
                  </Field>

                  <label className="flex items-center gap-2.5 text-sm text-foreground sm:col-span-2">
                    <Checkbox
                      name="allDay"
                      defaultChecked={event?.allDay}
                      className="size-4 rounded border-border accent-primary"
                    />
                    All-day event
                  </label>
                </div>

                <footer className="flex items-center justify-end gap-2 border-t border-border/50 bg-muted/30 p-4">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={pending}>
                    {pending ? "Saving…" : event ? "Save changes" : "Save event"}
                  </Button>
                </footer>
              </form>
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>
    </>
  );
}

function Field({
  label: caption,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{caption}</span>
        {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
