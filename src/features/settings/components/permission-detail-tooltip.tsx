"use client";

import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PermissionDetail } from "@/lib/permissions/permission-details";

/** The info button beside a permission: what it allows and every condition that limits it. */
export function PermissionDetailTooltip({
  label,
  detail,
}: {
  label: string;
  detail: PermissionDetail;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={`About ${label}`}
        className="mt-1 mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
      >
        <Info aria-hidden="true" className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-h-[var(--radix-tooltip-content-available-height)] max-w-sm overflow-y-auto">
        <p className="font-medium">{detail.allows}</p>
        {detail.unused && <p className="mt-1">Not used by any feature yet.</p>}
        {detail.conditions.length > 0 && (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 opacity-90">
            {detail.conditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
