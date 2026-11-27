"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  DoorOpen,
  Layers,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UnitStatusLegend } from "@/features/properties/components/unit-grid";
import { unitStatusLabel, unitStatusToneFor } from "@/features/properties/lib/unit-codes";
import { cn } from "@/lib/utils/cn";
import type { getDevelopment } from "../queries/development.queries";

type DevelopmentProperty = NonNullable<
  Awaited<ReturnType<typeof getDevelopment>>
>["properties"][number];

export function DevelopmentPropertyCard({
  property,
  canEdit,
  canAccess,
}: {
  property: DevelopmentProperty;
  canEdit: boolean;
  canAccess: boolean;
}) {
  const [showAllFloors, setShowAllFloors] = useState(false);
  const floors = [...property.floors].sort((a, b) => b.level - a.level);
  const units = floors.flatMap((floor) => floor.units);
  const available = units.filter((unit) => unit.status === "available").length;
  const hiddenFloors = floors.slice(3, -3);
  const foldEmptyFloors = floors.length > 6 && hiddenFloors.every((floor) => !floor.units.length);
  const visibleFloors =
    foldEmptyFloors && !showAllFloors ? [...floors.slice(0, 3), ...floors.slice(-3)] : floors;

  return (
    <details className="group/property overflow-hidden rounded-xl border border-border bg-card shadow-xs dark:border-primary/20 dark:bg-gradient-to-br dark:from-primary/5 dark:to-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden sm:gap-4">
        <PropertyThumbnail floors={floors.length} />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Building2 aria-hidden="true" className="size-5 shrink-0 text-primary" />
            <Link href={`/properties/${property.id}`} className="truncate hover:underline">
              {property.title}
            </Link>
          </h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Layers aria-hidden="true" className="size-3.5" />
              {floors.length} {floors.length === 1 ? "Floor" : "Floors"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <DoorOpen aria-hidden="true" className="size-3.5" />
              {units.length} {units.length === 1 ? "Unit" : "Units"}
            </span>
            <span className="inline-flex items-center gap-1.5 text-primary">
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
              {available} Available
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-8 shrink-0"
              aria-label={`Actions for ${property.title}`}
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/properties/${property.id}`}>View property</Link>
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem asChild>
                <Link href={`/properties/${property.id}/edit`}>Edit property</Link>
              </DropdownMenuItem>
            )}
            {canAccess && (
              <DropdownMenuItem asChild>
                <Link href={`/properties/${property.id}/access`}>Manage access</Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <ChevronDown
          aria-hidden="true"
          className="size-7 shrink-0 rounded-md border border-border p-1 text-muted-foreground transition-transform group-open/property:rotate-180"
        />
        <span className="sr-only">Toggle floors for {property.title}</span>
      </summary>
      <div className="px-3 pb-3">
        {floors.length ? (
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-muted/15 px-2 sm:px-3">
            {visibleFloors.map((floor, index) => (
              <div key={floor.id}>
                {foldEmptyFloors && !showAllFloors && index === 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllFloors(true)}
                    className="flex w-full items-center gap-2 border-t border-border/60 py-2 text-xs text-muted-foreground hover:text-primary"
                  >
                    <ChevronDown aria-hidden="true" className="size-4" />
                    Show {hiddenFloors.length} more empty floors
                  </button>
                )}
                <FloorRow floor={floor} propertyId={property.id} />
              </div>
            ))}
            {foldEmptyFloors && showAllFloors && (
              <button
                type="button"
                onClick={() => setShowAllFloors(false)}
                className="py-2 text-xs font-medium text-primary hover:underline"
              >
                Show fewer empty floors
              </button>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No floors configured yet.
          </p>
        )}
        {units.length > 0 && <UnitStatusLegend className="mt-3" />}
      </div>
    </details>
  );
}

function FloorRow({
  floor,
  propertyId,
}: {
  floor: DevelopmentProperty["floors"][number];
  propertyId: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const regionId = `development-floor-${floor.id}`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 py-2 sm:grid-cols-[140px_70px_minmax(0,1fr)] sm:items-center">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={regionId}
        aria-label={`Toggle ${floor.label}`}
        className="flex min-w-0 items-center gap-2 rounded text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-5 shrink-0 rounded bg-muted/70 p-0.5 transition-transform",
            !expanded && "-rotate-90",
          )}
        />
        <Layers aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{floor.label}</span>
      </button>
      <span
        className={cn(
          "w-fit rounded px-2 py-0.5 text-[11px] font-medium tabular-nums",
          floor.units.length ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {floor.units.length} {floor.units.length === 1 ? "unit" : "units"}
      </span>
      <div id={regionId} hidden={!expanded} className="col-span-2 sm:col-span-1">
        <div className="flex flex-wrap gap-1.5">
          {floor.units.length ? (
            floor.units.map((unit) => (
              <Link
                key={unit.id}
                href={`/properties/${propertyId}#floors-units`}
                title={`Unit ${unit.code}: ${unitStatusLabel(unit.status)}`}
                aria-label={`Unit ${unit.code}, ${unitStatusLabel(unit.status)}`}
                className={cn(
                  "max-w-full truncate rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums transition-shadow hover:ring-2 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  unitStatusToneFor(unit.status),
                )}
              >
                {unit.code}
              </Link>
            ))
          ) : (
            <span className="rounded border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
              No units yet
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PropertyThumbnail({ floors }: { floors: number }) {
  const levels = Math.min(Math.max(floors, 1), 6);
  return (
    <div className="hidden h-20 w-32 shrink-0 items-end justify-center overflow-hidden rounded-lg border border-primary/15 bg-primary/5 sm:flex">
      <svg viewBox="0 0 128 90" aria-hidden="true" className="h-full w-full text-primary">
        <path d="M10 73 60 50 120 72 69 89Z" fill="currentColor" fillOpacity="0.25" />
        <path
          d={`M28 ${72 - levels * 8} 78 ${54 - levels * 8} 102 ${64 - levels * 8} 52 ${82 - levels * 8}Z`}
          fill="var(--muted)"
        />
        <path
          d={`M28 ${72 - levels * 8} 52 ${82 - levels * 8} 52 82 28 72Z`}
          fill="var(--border)"
        />
        <path
          d={`M52 ${82 - levels * 8} 102 ${64 - levels * 8} 102 64 52 82Z`}
          fill="var(--muted)"
        />
        {Array.from({ length: levels }, (_, level) => (
          <g key={level} transform={`translate(0 ${-level * 8})`}>
            <path
              d="M55 75 65 71.4 65 76.4 55 80Z M69 70 79 66.4 79 71.4 69 75Z M83 65 98 59.6 98 64.6 83 70Z"
              fill="currentColor"
            />
            <path
              d="M31 66 38 69 38 74 31 71Z M41 70 49 73.5 49 78.5 41 75Z"
              fill="currentColor"
              fillOpacity="0.65"
            />
          </g>
        ))}
        <path
          d={`M28 ${72 - levels * 8} 78 ${54 - levels * 8} 102 ${64 - levels * 8}`}
          fill="none"
          stroke="var(--card)"
          strokeWidth="2"
        />
        <g fill="currentColor" fillOpacity="0.5">
          <ellipse cx="18" cy="72" rx="6" ry="3" />
          <ellipse cx="18" cy="66" rx="5" ry="8" />
          <ellipse cx="110" cy="70" rx="5" ry="3" />
          <ellipse cx="110" cy="63" rx="4" ry="8" />
        </g>
      </svg>
    </div>
  );
}
