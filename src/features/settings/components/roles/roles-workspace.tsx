"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

import { updateRolePermissions } from "../../actions/settings.actions";
import { RoleCard } from "./role-card";

type RoleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** The permission keys the role holds now. */
  granted: string[];
};

/** How many keys differ between two sets, counting adds and removals. */
function countDifference(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const key of a) if (!b.has(key)) count++;
  for (const key of b) if (!a.has(key)) count++;
  return count;
}

/** Every role's permissions, edited together and saved with one button. */
export function RolesWorkspace({
  roles,
  permissions,
}: {
  roles: RoleRow[];
  permissions: { key: string; module: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [edits, setEdits] = useState<Record<string, Set<string>>>({});

  const changes = roles.map((role) => {
    const granted = new Set(role.granted);
    const checked = edits[role.id] ?? granted;
    return { role, checked, count: countDifference(checked, granted) };
  });
  const dirty = changes.filter((c) => c.count > 0);
  const total = dirty.reduce((sum, c) => sum + c.count, 0);

  const saveAll = () =>
    startTransition(async () => {
      // One call per role, so each keeps the action's own checks and audit entry.
      const saved: string[] = [];
      for (const { role, checked } of dirty) {
        const result = await updateRolePermissions({
          roleId: role.id,
          permissionKeys: [...checked],
        });
        if (!result.success) {
          notify(`${role.name}: ${result.error.message || "Couldn't save."}`, "error");
          break;
        }
        saved.push(role.id);
      }
      if (saved.length) {
        setEdits((current) => {
          const next = { ...current };
          for (const id of saved) delete next[id];
          return next;
        });
        if (saved.length === dirty.length)
          notify(`Saved ${saved.length} role${saved.length === 1 ? "" : "s"}.`, "success");
        router.refresh();
      }
    });

  return (
    <TooltipProvider>
      <div className="mt-6 space-y-4 pb-24">
        {changes.map(({ role, checked, count }) => (
          <RoleCard
            key={role.id}
            roleId={role.id}
            slug={role.slug}
            name={role.name}
            description={role.description}
            isSystem={role.isSystem}
            permissions={permissions}
            checked={checked}
            changes={count}
            onChange={(next) => setEdits((current) => ({ ...current, [role.id]: next }))}
          />
        ))}
      </div>

      {total > 0 && (
        <div
          role="region"
          aria-label="Unsaved permission changes"
          className="sticky bottom-4 z-20 mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg"
        >
          <p className="text-sm">
            <span className="font-semibold">
              {total} change{total === 1 ? "" : "s"}
            </span>{" "}
            across {dirty.map((c) => c.role.name).join(", ")}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setEdits({})}
            >
              Discard
            </Button>
            <Button type="button" disabled={pending} onClick={saveAll}>
              {pending ? "Saving…" : "Save all"}
            </Button>
          </div>
        </div>
      )}
    </TooltipProvider>
  );
}
