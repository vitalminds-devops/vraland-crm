"use client";

import { cn } from "@/lib/utils/cn";
import { unitStatusLabels, unitStatusTone, unitStatuses } from "../lib/unit-codes";

export function UnitStatusLegend({
  selected = false,
  className,
}: {
  selected?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {unitStatuses.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-3 shrink-0 rounded-[4px] border", unitStatusTone[status])}
          />
          {unitStatusLabels[status]}
        </li>
      ))}
      {selected && (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-[4px] border border-primary bg-primary/20 ring-1 ring-primary"
          />
          Selected
        </li>
      )}
    </ul>
  );
}
