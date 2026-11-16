import { Building2, ChevronRight, Layers, MapPin, Pencil } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { DotBadge } from "@/components/ui/dot-badge";
import { label, statusBadgeTone } from "../lib/development-utils";
import { developmentCoverImageUrl } from "../lib/cover-image";
import { DevelopmentCover } from "./development-cover";

type DevelopmentRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  city: string | null;
  province: string | null;
  coverImageStorageKey: string | null;
  propertyNames: string[];
};

type Props = {
  rows: DevelopmentRow[];
  canUpdate: boolean;
};

/** One row per development: its cover, what and where it is, its buildings, and buttons for the next step. */
export function DevelopmentGrid({ rows, canUpdate }: Props) {
  if (!rows.length) {
    return (
      <div className="grid place-items-center px-6 py-16 text-center">
        <Layers aria-hidden="true" className="size-8 text-muted-foreground/40" />
        <h2 className="mt-3 text-sm font-medium">No developments found.</h2>
      </div>
    );
  }

  return (
    <div>
      <div
        aria-hidden="true"
        className="hidden items-center gap-x-5 border-b border-border/40 bg-muted/30 px-5 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:flex"
      >
        <span className="flex-1">Development</span>
        <span className="w-20 text-right">Properties</span>
        <span className="w-56 text-right">Actions</span>
      </div>
      <ul className="divide-y divide-border/40">
        {rows.map((row) => {
          const location = [row.city, row.province].filter(Boolean).join(", ");
          const buildings = row.propertyNames.length;
          return (
            <li
              key={row.id}
              className="group relative flex cursor-pointer flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4 transition-colors before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary before:opacity-0 before:transition-opacity hover:bg-primary/[0.03] hover:before:opacity-100 sm:px-5"
            >
              {/* The whole row opens the development; the buttons sit above it. */}
              <Link
                href={`/developments/${row.id}`}
                aria-label={`Open ${row.name}`}
                className="absolute inset-0 z-0"
              />
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-muted shadow-sm transition-transform duration-300 group-hover:scale-[1.03] sm:h-[72px] sm:w-28">
                <DevelopmentCover
                  src={developmentCoverImageUrl(row)}
                  initial={row.name.slice(0, 1).toUpperCase()}
                />
              </div>

              <div className="min-w-0 flex-1 basis-48">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h2 className="truncate text-[15px] font-semibold tracking-tight transition-colors group-hover:text-primary">
                    {row.name}
                  </h2>
                  <DotBadge tone={statusBadgeTone(row.status)}>{label(row.status)}</DotBadge>
                </div>
                <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="whitespace-nowrap">
                    Code{" "}
                    <span className="font-mono text-[11px] text-foreground/80">{row.code}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  {location ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <MapPin aria-hidden="true" className="size-3 shrink-0" />
                      <span className="truncate">{location}</span>
                    </span>
                  ) : canUpdate ? (
                    <Link
                      href={`/developments/${row.id}/edit`}
                      className="relative z-10 font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
                    >
                      Add location
                    </Link>
                  ) : (
                    <span>No location set</span>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {buildings ? (
                    <>
                      {row.propertyNames.slice(0, 3).map((name) => (
                        <span
                          key={name}
                          className="inline-flex max-w-40 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                        >
                          <Building2
                            aria-hidden="true"
                            className="size-3 shrink-0 text-muted-foreground"
                          />
                          <span className="truncate">{name}</span>
                        </span>
                      ))}
                      {buildings > 3 && (
                        <span
                          className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                          title={row.propertyNames.slice(3).join(", ")}
                        >
                          +{buildings - 3} more
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">
                      No buildings yet
                    </span>
                  )}
                </div>
              </div>

              <div className="hidden w-20 shrink-0 justify-end sm:flex">
                <span
                  className={`inline-flex min-w-10 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${buildings ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                  title={`${buildings} ${buildings === 1 ? "building" : "buildings"}`}
                >
                  <Building2 aria-hidden="true" className="size-3.5" />
                  {buildings}
                </span>
              </div>

              <div className="relative z-10 flex w-full items-center justify-end gap-2 sm:w-56">
                {canUpdate && (
                  <ButtonLink
                    href={`/developments/${row.id}/edit`}
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    aria-label={`Edit ${row.name}`}
                  >
                    <Pencil aria-hidden="true" className="size-3.5" />
                    Edit
                  </ButtonLink>
                )}
                <ButtonLink
                  href={`/developments/${row.id}`}
                  variant="primary"
                  size="sm"
                  className="gap-1"
                >
                  {buildings ? "View properties" : "Add property"}
                  <ChevronRight aria-hidden="true" className="size-3.5" />
                </ButtonLink>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
