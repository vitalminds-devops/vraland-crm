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
  hasFilters?: boolean;
};

/** One row per development: its cover, what and where it is, its buildings, and buttons for the next step. */
export function DevelopmentGrid({ rows, canUpdate, hasFilters = false }: Props) {
  if (!rows.length) {
    return (
      <div className="grid place-items-center px-6 py-16 text-center">
        <Layers aria-hidden="true" className="size-8 text-muted-foreground/40" />
        <h2 className="mt-3 text-sm font-medium">
          {hasFilters ? "No matching developments" : "No developments yet"}
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {hasFilters
            ? "Try another search or clear the filters to see all developments."
            : "Developments and their properties will appear here once added."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        aria-hidden="true"
        className="hidden items-center gap-x-5 border-b border-border/40 bg-muted/30 px-5 py-2 text-xs font-medium text-muted-foreground lg:flex"
      >
        <span className="flex-1">Development</span>
        <span className="w-28 text-right">Properties</span>
        <span className="w-56 text-right">Actions</span>
      </div>
      <ul className="divide-y divide-border/40">
        {rows.map((row) => {
          const location = [row.city, row.province].filter(Boolean).join(", ");
          const buildings = row.propertyNames.length;
          return (
            <li
              key={row.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-4 transition-colors hover:bg-muted/30 sm:px-5 lg:grid-cols-[auto_minmax(0,1fr)_7rem_14rem] lg:gap-x-5"
            >
              <div className="h-14 w-20 overflow-hidden rounded-lg bg-muted sm:h-[72px] sm:w-28">
                <DevelopmentCover
                  src={developmentCoverImageUrl(row)}
                  initial={row.name.slice(0, 1).toUpperCase()}
                />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h2 className="min-w-0 text-[15px] font-semibold tracking-tight [overflow-wrap:anywhere]">
                    <Link
                      href={`/developments/${row.id}`}
                      className="rounded-sm hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                    >
                      {row.name}
                    </Link>
                  </h2>
                  <DotBadge tone={statusBadgeTone(row.status)}>{label(row.status)}</DotBadge>
                </div>
                <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    Code <span className="text-foreground/80">{row.code}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  {location ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <MapPin aria-hidden="true" className="size-3 shrink-0" />
                      <span className="[overflow-wrap:anywhere]">{location}</span>
                    </span>
                  ) : canUpdate ? (
                    <Link
                      href={`/developments/${row.id}/edit`}
                      className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
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
                      No properties yet
                    </span>
                  )}
                </div>
              </div>

              <div className="col-span-2 flex lg:col-span-1 lg:justify-end">
                <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
                  <Building2 aria-hidden="true" className="size-3.5" />
                  {buildings} {buildings === 1 ? "property" : "properties"}
                </span>
              </div>

              <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:justify-end">
                {canUpdate && (
                  <ButtonLink
                    href={`/developments/${row.id}/edit`}
                    variant="secondary"
                    size="sm"
                    className="min-h-10 gap-1.5 lg:min-h-8"
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
                  className="min-h-10 gap-1 lg:min-h-8"
                  aria-label={`View properties in ${row.name}`}
                >
                  View properties
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
