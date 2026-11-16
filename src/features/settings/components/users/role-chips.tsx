"use client";

import { Check } from "lucide-react";

import { DotBadge, type DotBadgeTone } from "@/components/ui/dot-badge";
import { roleDescription, roleLabel } from "@/lib/permissions/catalog";
import { cn } from "@/lib/utils/cn";

export type RoleOption = { id: string; name: string; slug: string };

export function roleDescriptionFor(name: string): string {
  return roleDescription(normalizeSlug(name), null);
}

const roleTones: Record<string, DotBadgeTone> = {
  administrator: "purple",
  "super-administrator": "purple",
  broker: "blue",
  "master-broker": "purple",
  agent: "green",
  "sales-manager": "amber",
};

function normalizeSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-");
}

export function RoleChips({
  roles,
  max = 2,
  className,
}: {
  roles: RoleOption[];
  max?: number;
  className?: string;
}) {
  if (!roles.length) {
    return <span className={cn("text-xs text-muted-foreground", className)}>No role</span>;
  }

  const visible = roles.slice(0, max);
  const overflow = roles.length - visible.length;
  const labelOf = (role: RoleOption) => roleLabel(role.slug, role.name);

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {visible.map((role) => (
        <DotBadge key={role.id} tone={roleTones[role.slug] ?? "gray"}>
          <span data-role={role.slug}>{labelOf(role)}</span>
        </DotBadge>
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground"
          title={roles.slice(max).map(labelOf).join(", ")}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

export function RoleChipToggle({
  roles,
  selectedIds,
  onToggle,
  disabledRoleIds = [],
}: {
  roles: RoleOption[];
  selectedIds: string[];
  onToggle: (roleId: string) => void;
  /** Roles that must stay selected and cannot be edited (e.g. super admin). */
  disabledRoleIds?: string[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {roles.map((role) => {
        const selected = selectedIds.includes(role.id);
        const locked = disabledRoleIds.includes(role.id);
        return (
          <button
            key={role.id}
            type="button"
            role="checkbox"
            aria-checked={selected}
            disabled={locked}
            onClick={() => onToggle(role.id)}
            className={cn(
              "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              selected
                ? "border-primary/60 bg-primary/5"
                : "border-border/60 bg-card hover:bg-muted/50",
              locked && "cursor-not-allowed opacity-70",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid h-4 w-4 shrink-0 place-content-center rounded-sm border",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background",
              )}
              aria-hidden="true"
            >
              {selected && <Check className="h-3 w-3" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                {roleLabel(role.slug, role.name)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {locked ? "Managed by provisioning" : roleDescription(role.slug, null)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
