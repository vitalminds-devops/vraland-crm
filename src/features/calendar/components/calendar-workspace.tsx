"use client";

import { useMemo, useState } from "react";
import { BackButton } from "@/components/common/back-button";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { CalendarToolbar, type CalendarView as ViewId } from "./calendar-toolbar";
import { CalendarView } from "./calendar-view";
import { EventForm } from "./event-form";
import { ViewingForm } from "./viewing-form";
import { CALENDAR_FILTERS, matchesFilter, type CalendarFilter } from "../lib/event-colors";
import type { CalendarEvent } from "../lib/event-types";
import { manilaWall } from "../lib/calendar-helpers";

type Person = { id: string; firstName: string; lastName: string | null };
type Property = {
  id: string;
  title: string;
  addressLine1: string | null;
  city: string | null;
};
type Options = {
  agents: Person[];
  contacts: Person[];
  properties: Property[];
};

export function CalendarWorkspace({
  title,
  description,
  basePath,
  backHref,
  date,
  view,
  events,
  activeFilter,
  canCreate,
  options,
  canAssign,
  currentUserId,
}: {
  title: string;
  description: string;
  basePath: string;
  backHref?: string;
  date: Date;
  view: ViewId;
  events: CalendarEvent[];
  activeFilter: CalendarFilter["id"];
  canCreate: boolean;
  options: Options;
  canAssign: boolean;
  currentUserId: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<Date | undefined>(undefined);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const shown = useMemo(
    () =>
      events.map((event) => ({
        ...event,
        startAt: manilaWall(new Date(event.startAt)),
        endAt: manilaWall(new Date(event.endAt)),
      })),
    [events],
  );
  const shownDate = useMemo(() => manilaWall(new Date(date)), [date]);

  const openAddOn = (target: Date) => {
    setAddDate(target);
    setAddOpen(true);
  };

  const counts = Object.fromEntries(
    CALENDAR_FILTERS.map((filter) => [
      filter.id,
      shown.filter((e) => matchesFilter(e, filter.id)).length,
    ]),
  ) as Record<CalendarFilter["id"], number>;

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {backHref ? <BackButton fallbackHref={backHref} label="Back to calendar" /> : null}
      {canCreate ? (
        <>
          <EventForm
            agents={options.agents}
            trigger={false}
            open={addOpen}
            onOpenChange={setAddOpen}
            defaultDate={addDate}
          />
          <EventForm
            key={editing?.id ?? "none"}
            agents={options.agents}
            trigger={false}
            event={editing}
            open={editing !== null}
            onOpenChange={(open) => {
              if (!open) setEditing(null);
            }}
          />
          <Button type="button" variant="secondary" onClick={() => openAddOn(new Date(shownDate))}>
            Add event
          </Button>
          <ViewingForm options={options} canAssign={canAssign} currentUserId={currentUserId} />
        </>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 sm:gap-5">
      <PageHeader title={title} description={description} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
        <CalendarToolbar
          basePath={basePath}
          date={shownDate}
          view={view}
          activeFilter={activeFilter}
          counts={counts}
          actions={actions}
        />
        <CalendarView
          date={shownDate}
          view={view}
          events={shown}
          basePath={basePath}
          activeFilter={activeFilter}
          canCreate={canCreate}
          onAddOnDate={openAddOn}
          onEditEvent={(event) => setEditing(events.find((e) => e.id === event.id) ?? null)}
        />
      </div>
    </div>
  );
}
