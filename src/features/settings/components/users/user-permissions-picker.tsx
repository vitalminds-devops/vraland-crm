"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { permissionKeys, permissionModule } from "@/lib/permissions/catalog";
import {
  applyPermissionOverrides,
  overridesFor,
  type PermissionOverride,
} from "@/lib/permissions/user-permissions";

import { RolePermissionsPicker } from "../settings-forms";

const catalogPermissions = permissionKeys.map((key) => ({ key, module: permissionModule(key) }));

/** The catalog's permissions for one user: ticked from their roles, plus or minus their own changes. */
export function UserPermissionsPicker({
  userId,
  roleKeys,
  overrides,
  onChange,
}: {
  userId: string;
  /** Every permission the selected roles give. */
  roleKeys: string[];
  overrides: PermissionOverride[];
  onChange: (next: PermissionOverride[]) => void;
}) {
  return (
    <TooltipProvider>
      <div className="grid gap-2">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {overrides.length ? `${overrides.length} changed from roles` : "Same as roles"}
          </span>
          {overrides.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
            >
              Reset to roles
            </button>
          )}
        </div>
        <RolePermissionsPicker
          roleId={`user-${userId}`}
          permissions={catalogPermissions}
          checked={applyPermissionOverrides(roleKeys, overrides)}
          onChange={(next) => onChange(overridesFor(roleKeys, next))}
        />
      </div>
    </TooltipProvider>
  );
}
