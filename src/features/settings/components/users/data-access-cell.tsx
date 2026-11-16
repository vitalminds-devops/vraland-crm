"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  dataScopeLabels,
  dataScopePermissions,
  permissionMetadata,
  type DataScope,
} from "@/lib/permissions/catalog";

export function DataAccessCell({ scope }: { scope: DataScope }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          {dataScopeLabels[scope]}
        </span>
      </TooltipTrigger>
      <TooltipContent>{permissionMetadata[dataScopePermissions[scope]].description}</TooltipContent>
    </Tooltip>
  );
}
