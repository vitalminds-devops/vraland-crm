"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { dataScopeLabels, roleDescription, roleLabel } from "@/lib/permissions/catalog";
import { resolveDataScope } from "@/lib/permissions/policy";
import { cn } from "@/lib/utils/cn";
import { RolePermissionsPicker } from "../settings-forms";

export function RoleCard({
  roleId,
  slug,
  name,
  description,
  isSystem,
  permissions,
  checked,
  changes,
  onChange,
}: {
  roleId: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { key: string; module: string }[];
  /** The permission keys ticked now, saved or not. */
  checked: Set<string>;
  /** Unsaved adds and removals. */
  changes: number;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `role-permissions-${roleId}`;

  return (
    <section className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs dark:shadow-none">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full flex-wrap items-start justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/25"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold leading-none text-foreground">
                {roleLabel(slug, name)}
              </span>
              <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {isSystem ? "System role" : "Custom role"}
              </span>
            </span>
            <span className="mt-1.5 block max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {roleDescription(slug, description)}
            </span>
          </span>
          <span className="flex shrink-0 flex-wrap items-center gap-2">
            {changes > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {changes} unsaved
              </span>
            )}
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              {dataScopeLabels[resolveDataScope({ permissions: checked })]}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {checked.size} of {permissions.length} granted
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </span>
        </button>
      </h2>
      <div id={panelId} className={cn("border-t border-border/60 px-5 py-4", !open && "hidden")}>
        <RolePermissionsPicker
          roleId={roleId}
          permissions={permissions}
          checked={checked}
          onChange={onChange}
        />
      </div>
    </section>
  );
}
