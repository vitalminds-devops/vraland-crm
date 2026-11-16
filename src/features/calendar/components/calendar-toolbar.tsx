"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils/cn";
import { CALENDAR_FILTERS, EVENT_COLORS, type CalendarFilter } from "../lib/event-colors";

export type CalendarView = "month" | "week" | "day" | "agenda";

const CALENDAR_VIEWS: {
  id: CalendarView;
  label: string;
  shortcut: string;
}[] = [
  { id: "month", label: "Month", shortcut: "M" },
  { id: "week", label: "Week", shortcut: "W" },
  { id: "day", label: "Day", shortcut: "D" },
  { id: "agenda", label: "Agenda", shortcut: "A" },
];

/** Step the anchor date by one month/week/day depending on the active view. */
function offsetDate(date: Date, view: CalendarView, delta: number): string {
  const next = new Date(date);
  if (view === "month") next.setMonth(next.getMonth() + delta);
  else if (view === "week") next.setDate(next.getDate() + delta * 7);
  else next.setDate(next.getDate() + delta);
  return format(next, "yyyy-MM-dd");
}

export function CalendarToolbar({
  basePath,
  date,
  view,
  activeFilter,
  counts,
  actions,
}: {
  basePath: string;
  date: Date;
  view: CalendarView;
  activeFilter: CalendarFilter["id"];
  counts: Record<CalendarFilter["id"], number>;
  actions?: ReactNode;
}) {
  const dateParam = format(date, "yyyy-MM-dd");
  const href = (next: { date?: string; view?: CalendarView; filter?: string }) => {
    const params = new URLSearchParams();
    params.set("date", next.date ?? dateParam);
    params.set("view", next.view ?? view);
    const filter = next.filter ?? (activeFilter === "all" ? "" : activeFilter);
    if (filter && filter !== "all") params.set("type", filter);
    return `${basePath}?${params.toString()}`;
  };

  const label = view === "day" ? format(date, "MMMM d, yyyy") : format(date, "MMMM yyyy");

  return (
    <div className="border-b border-border/50">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-lg font-semibold tracking-tight sm:text-xl">{label}</h2>
          <div className="flex items-center rounded-lg border border-border/60">
            <IconLink
              href={href({ date: offsetDate(date, view, -1) })}
              label={`Previous ${view}`}
              shortcut={"\u2190"}
              className="rounded-l-lg border-r border-border/60"
            >
              <ChevronLeft className="size-4" />
            </IconLink>
            <IconLink
              href={href({ date: offsetDate(date, view, 1) })}
              label={`Next ${view}`}
              shortcut={"\u2192"}
            >
              <ChevronRight className="size-4" />
            </IconLink>
          </div>
          <Link
            href={href({ date: format(new Date(), "yyyy-MM-dd") })}
            className="rounded-lg border border-border/60 px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted/60"
            title="Today (T)"
          >
            Today
          </Link>
        </div>
        {actions}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-muted/20 px-3 py-2 sm:px-4">
        <nav
          className="hidden flex-wrap items-center gap-1 md:flex"
          aria-label="Filter by event type"
        >
          {CALENDAR_FILTERS.map((filter) => (
            <FilterPill
              key={filter.id}
              filter={filter}
              href={href({ filter: filter.id })}
              active={activeFilter === filter.id}
              count={counts[filter.id] ?? 0}
            />
          ))}
        </nav>
        <MobileFilterMenu
          activeFilter={activeFilter}
          counts={counts}
          hrefFor={(id) => href({ filter: id })}
        />

        <nav
          className="hidden items-center overflow-hidden rounded-lg border border-border/60 md:flex"
          aria-label="Calendar view"
        >
          {CALENDAR_VIEWS.map((option) => (
            <Link
              key={option.id}
              href={href({ view: option.id })}
              aria-current={view === option.id ? "page" : undefined}
              title={`${option.label} view (${option.shortcut})`}
              className={cn(
                "px-2.5 py-1.5 text-[13px] font-medium capitalize transition-colors",
                view === option.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/60",
              )}
            >
              {option.label}
            </Link>
          ))}
        </nav>
        <MobileViewSelect value={view} onChange={href} />
      </div>
    </div>
  );
}

function IconLink({
  href,
  label,
  shortcut,
  className,
  children,
}: {
  href: string;
  label: string;
  shortcut: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={`${label} (${shortcut})`}
      title={`${label} (${shortcut})`}
      className={cn(
        "grid size-8 place-items-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function FilterPill({
  filter,
  href,
  active,
  count,
}: {
  filter: CalendarFilter;
  href: string;
  active: boolean;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          filter.kind ? EVENT_COLORS[filter.kind].dot : "bg-muted-foreground/50",
        )}
      />
      {filter.label}
      {count > 0 ? (
        <span
          className={cn(
            "rounded-full px-1.5 text-[11px] tabular-nums",
            active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function MobileFilterMenu({
  activeFilter,
  counts,
  hrefFor,
}: {
  activeFilter: CalendarFilter["id"];
  counts: Record<CalendarFilter["id"], number>;
  hrefFor: (id: CalendarFilter["id"]) => string;
}) {
  const current = CALENDAR_FILTERS.find((f) => f.id === activeFilter);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-[13px] font-medium md:hidden"
        >
          <ListFilter className="size-3.5" />
          {current?.label ?? "All"}
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {CALENDAR_FILTERS.map((filter) => (
          <DropdownMenuItem key={filter.id} asChild>
            <Link href={hrefFor(filter.id)} className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 rounded-full",
                  filter.kind ? EVENT_COLORS[filter.kind].dot : "bg-muted-foreground/50",
                )}
              />
              <span className="flex-1">{filter.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {counts[filter.id] ?? 0}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileViewSelect({
  value,
  onChange,
}: {
  value: CalendarView;
  onChange: (next: { view: CalendarView }) => string;
}) {
  return (
    <NativeSelect
      aria-label="Calendar view"
      value={value}
      onChange={(e) => {
        window.location.href = onChange({
          view: e.target.value as CalendarView,
        });
      }}
      wrapperClassName="md:hidden"
      className="h-8 rounded-lg border border-border/60 bg-card px-2 pr-9 text-[13px] capitalize"
    >
      {CALENDAR_VIEWS.map((option) => (
        <NativeSelectOption key={option.id} value={option.id}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
