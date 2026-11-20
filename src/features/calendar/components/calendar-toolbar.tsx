"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { endOfWeek, format, startOfWeek } from "date-fns";
import {
  CalendarDays,
  CalendarRange,
  Calendar,
  List,
  Eye,
  Phone,
  KeyRound,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils/cn";
import { CALENDAR_FILTERS, type CalendarFilter } from "../lib/event-colors";
import { manilaWall, shift } from "../lib/calendar-helpers";

export type CalendarView = "month" | "week" | "day" | "agenda";

const CALENDAR_VIEWS: {
  id: CalendarView;
  label: string;
  shortcut: string;
  icon: LucideIcon;
}[] = [
  { id: "month", label: "Month", shortcut: "M", icon: CalendarDays },
  { id: "week", label: "Week", shortcut: "W", icon: CalendarRange },
  { id: "day", label: "Day", shortcut: "D", icon: Calendar },
  { id: "agenda", label: "Agenda", shortcut: "A", icon: List },
];

const FILTER_ICONS = { all: CalendarDays, viewing: Eye, follow_up: Phone, closing: KeyRound };
const focusClass =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

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

  const label =
    view === "day"
      ? format(date, "MMMM d, yyyy")
      : view === "week"
        ? `${format(startOfWeek(date), "MMM d")} – ${format(endOfWeek(date), "MMM d, yyyy")}`
        : view === "agenda"
          ? `From ${format(date, "MMM d, yyyy")}`
          : format(date, "MMMM yyyy");

  return (
    <div className="border-b border-border/50">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 w-full sm:w-auto">
            <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{label}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Philippine time (UTC+8)</p>
          </div>
          <div className="flex items-center rounded-lg border border-border/60">
            <IconLink
              href={href({ date: format(shift(date, view, -1), "yyyy-MM-dd") })}
              label={`Previous ${view === "agenda" ? "day" : view}`}
              shortcut={"\u2190"}
              className="rounded-l-lg border-r border-border/60"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </IconLink>
            <IconLink
              href={href({ date: format(shift(date, view, 1), "yyyy-MM-dd") })}
              label={`Next ${view === "agenda" ? "day" : view}`}
              shortcut={"\u2192"}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </IconLink>
          </div>
          <Link
            href={href({ date: format(manilaWall(new Date()), "yyyy-MM-dd") })}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-lg border border-border/60 px-3 text-sm font-medium transition-colors hover:bg-muted/60",
              focusClass,
            )}
            title="Today (T)"
          >
            <Calendar aria-hidden="true" className="size-4" /> Today
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
          className="hidden items-center rounded-lg border border-border/60 p-1 md:flex"
          aria-label="Calendar view"
        >
          {CALENDAR_VIEWS.map((option) => (
            <Link
              key={option.id}
              href={href({ view: option.id })}
              aria-current={view === option.id ? "page" : undefined}
              title={`${option.label} view (${option.shortcut})`}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                focusClass,
                view === option.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/60",
              )}
            >
              <option.icon aria-hidden="true" className="size-4" /> {option.label}
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
        "grid size-10 place-items-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
        focusClass,
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
  const Icon = FILTER_ICONS[filter.id];
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors",
        focusClass,
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {filter.id === "all" ? "All events" : filter.label}
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
          aria-label={`Filter by event type: ${current?.label ?? "All events"}`}
          className={cn(
            "inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-[13px] font-medium md:hidden",
            focusClass,
          )}
        >
          <ListFilter aria-hidden="true" className="size-4" />
          {activeFilter === "all" ? "All events" : current?.label}
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {CALENDAR_FILTERS.map((filter) => {
          const Icon = FILTER_ICONS[filter.id];
          return (
            <DropdownMenuItem key={filter.id} asChild>
              <Link href={hrefFor(filter.id)} className="flex items-center gap-2">
                <Icon aria-hidden="true" className="size-4" />
                <span className="flex-1">{filter.id === "all" ? "All events" : filter.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {counts[filter.id] ?? 0}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
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
      className="h-10 rounded-lg border border-border/60 bg-card px-2 pr-9 text-[13px]"
    >
      {CALENDAR_VIEWS.map((option) => (
        <NativeSelectOption key={option.id} value={option.id}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
