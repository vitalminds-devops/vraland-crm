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
import { CalendarClock, X } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

import { createViewing } from "../actions/calendar.actions";

type Person = { id: string; firstName: string; lastName: string | null };
type Property = {
  id: string;
  title: string;
  addressLine1: string | null;
  city: string | null;
};

const field =
  "h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-border focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25";

export function ViewingForm({
  options,
  canAssign,
  currentUserId,
}: {
  options: { agents: Person[]; contacts: Person[]; properties: Property[] };
  canAssign: boolean;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  // Filter agents based on permission
  const visibleAgents = canAssign
    ? options.agents
    : options.agents.filter((a) => a.id === currentUserId);

  return (
    <>
      <Button variant="primary" className="gap-2" onClick={() => setOpen(true)}>
        <CalendarClock aria-hidden="true" className="size-4" />
        Schedule viewing
      </Button>

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
            <DialogPopup className="w-full max-w-xl rounded-xl border border-border/60 bg-card shadow-2xl">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  start(async () => {
                    const r = await createViewing(Object.fromEntries(f));
                    if (r.success) {
                      setOpen(false);
                      notify("Viewing scheduled.", "success");
                    } else notify(r.error.message, "error");
                  });
                }}
                className="flex max-h-[calc(100dvh-2rem)] flex-col"
              >
                <header className="flex items-start justify-between gap-4 border-b border-border/50 p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-1/10 text-brand-1 dark:bg-brand-1/15"
                    >
                      <CalendarClock aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <DialogTitle className="text-base leading-tight font-semibold text-foreground">
                        Schedule viewing
                      </DialogTitle>
                      <DialogDescription className="mt-0.5 text-[13px] text-muted-foreground">
                        Property, client and agent.
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

                <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5">
                  <Field label="Viewing title">
                    <Input
                      required
                      name="title"
                      autoFocus
                      placeholder="e.g. First viewing"
                      className={field}
                    />
                  </Field>

                  <Field label="Property">
                    <NativeSelect
                      required
                      name="propertyId"
                      defaultValue=""
                      className={cn(field, "pr-9")}
                    >
                      <NativeSelectOption value="" disabled>
                        Select a property
                      </NativeSelectOption>
                      {options.properties.map((v) => (
                        <NativeSelectOption key={v.id} value={v.id}>
                          {v.title} · {[v.addressLine1, v.city].filter(Boolean).join(", ")}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Contact">
                    <NativeSelect
                      required
                      name="contactId"
                      defaultValue=""
                      className={cn(field, "pr-9")}
                    >
                      <NativeSelectOption value="" disabled>
                        Select a contact
                      </NativeSelectOption>
                      {options.contacts.map((v) => (
                        <NativeSelectOption key={v.id} value={v.id}>
                          {`${v.firstName} ${v.lastName ?? ""}`.trim()}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>

                  {canAssign ? (
                    <Field label="Agent">
                      <NativeSelect name="agentUserId" className={cn(field, "pr-9")}>
                        <NativeSelectOption value="">Assign to me</NativeSelectOption>
                        {visibleAgents.map((v) => (
                          <NativeSelectOption key={v.id} value={v.id}>
                            {`${v.firstName} ${v.lastName ?? ""}`.trim()}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  ) : (
                    <input type="hidden" name="agentUserId" value={currentUserId} />
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Starts">
                      <DatePicker
                        type="datetime-local"
                        required
                        name="startAt"
                        className={cn(field, "pr-2")}
                      />
                    </Field>
                    <Field label="Ends">
                      <DatePicker
                        type="datetime-local"
                        required
                        name="endAt"
                        className={cn(field, "pr-2")}
                      />
                    </Field>
                  </div>

                  <Field label="Meeting location" hint="Optional">
                    <Input name="location" placeholder="Meeting place" className={field} />
                  </Field>

                  <Field label="Preparation notes" hint="Optional">
                    <Textarea
                      name="notes"
                      rows={3}
                      placeholder="Notes"
                      className={cn(field, "h-auto py-2 leading-relaxed")}
                    />
                  </Field>
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
                    {pending ? "Scheduling…" : "Schedule viewing"}
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
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{caption}</span>
        {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
