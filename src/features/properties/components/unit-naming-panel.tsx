"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { saveUnitNaming } from "../actions/unit-naming.actions";
import type { FloorGroup } from "../lib/floor-groups";
import { unitNamingSchema } from "../schemas/unit-naming.schema";
import { FloorGroupsField } from "./floor-groups-field";

/** The Design page's Sections tab (stored as floor groups). Unit identifiers are set from Design floor's Identifier button. */
export function UnitNamingPanel({
  propertyId,
  floors,
  floorGroups,
  unitEndings,
}: {
  propertyId: string;
  floors: { id: string; label: string }[];
  floorGroups: FloorGroup[];
  unitEndings: string[];
}) {
  const [groups, setGroups] = useState(floorGroups);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const input = { propertyId, floorGroups: groups };
    // Checked here first so the message names the problem, not just "Review the fields".
    const checked = unitNamingSchema.safeParse(input);
    if (!checked.success)
      return notify(checked.error.issues[0]?.message ?? "Check the sections.", "error");
    startTransition(async () => {
      const result = await saveUnitNaming(input);
      notify(
        result.success ? "Sections saved." : result.error.message,
        result.success ? "success" : "error",
      );
    });
  };

  return (
    <form
      aria-label="Sections"
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <FloorGroupsField
        floors={floors}
        groups={groups}
        onChange={setGroups}
        disabled={pending}
        unitEndings={unitEndings}
      />

      <div className="flex justify-end border-t border-border/40 pt-4">
        <Button type="submit" disabled={pending} className="h-11 w-full sm:h-10 sm:w-auto">
          {pending ? "Saving…" : "Save sections"}
        </Button>
      </div>
    </form>
  );
}
