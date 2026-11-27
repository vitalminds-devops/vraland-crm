"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { setUpFloors } from "../actions/floor-setup.actions";
import { emptyFloorSetup, floorSetupInput } from "../lib/floor-setup-draft";
import type { UnitIdentifier } from "../lib/unit-identifier";
import { FloorSetupFields } from "./floor-setup-fields";

/** The Design page's first step for a property with no floors: pick the floors, then design them. */
export function FloorSetupPanel({
  propertyId,
  style,
}: {
  propertyId: string;
  style: UnitIdentifier["style"] | undefined;
}) {
  const [draft, setDraft] = useState({ ...emptyFloorSetup, style: style ?? emptyFloorSetup.style });
  const [pending, startTransition] = useTransition();
  const input = floorSetupInput(draft);

  return (
    <form
      aria-label="Floor setup"
      className="space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await setUpFloors(propertyId, input);
          notify(
            result.success ? "Floors added." : result.error.message,
            result.success ? "success" : "error",
          );
        });
      }}
    >
      <FloorSetupFields value={draft} onChange={setDraft} disabled={pending} />
      <div className="flex justify-end border-t border-border/40 pt-4">
        <Button
          type="submit"
          disabled={pending || !input}
          className="h-11 w-full disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 sm:h-10 sm:w-auto"
        >
          {pending ? "Adding…" : "Add floors"}
        </Button>
      </div>
    </form>
  );
}
