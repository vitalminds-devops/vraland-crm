"use client";

import { PenLine, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { AddCountDialog } from "./add-count-dialog";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import {
  addFloor,
  deleteFloor,
  renameFloor,
  renameUnit,
  setUnitStatus,
} from "../actions/unit.actions";
import {
  unitStatusLabel,
  unitStatusLabels,
  unitStatusToneFor,
  unitStatuses,
} from "../lib/unit-codes";

export function UnitStatusControl({ unitId, status }: { unitId: string; status: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex w-full">
      <NativeSelect
        aria-label="Unit status"
        value={status}
        disabled={pending}
        wrapperClassName="w-full"
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            const response = await setUnitStatus(unitId, next);
            notify(
              response.success
                ? `Unit marked ${unitStatusLabel(next).toLowerCase()}.`
                : response.message,
              response.success ? "success" : "error",
            );
          });
        }}
        className={cn(
          "h-8 w-full cursor-pointer rounded-md border px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-60",
          unitStatusToneFor(status),
          "pr-7 sm:text-xs",
        )}
      >
        {unitStatuses.map((value) => (
          <NativeSelectOption
            key={value}
            value={value}
            className="bg-white font-medium text-slate-900"
          >
            {unitStatusLabels[value]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </span>
  );
}

/** Runs a floor/unit action and shows its message. */
function useUnitAction() {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ success: boolean; message: string }>) =>
    startTransition(async () => {
      const response = await action();
      notify(response.message, response.success ? "success" : "error");
    });
  return [pending, run] as const;
}

export function AddFloorButton({
  propertyId,
  className = "h-7 gap-1 px-2 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary",
}: {
  propertyId: string;
  className?: string;
}) {
  return (
    <AddCountDialog
      label="Add floor"
      title="Add floors"
      variant="ghost"
      buttonClassName={className}
      fields={[{ name: "floors", label: "How many floors?", min: 1, initial: 1 }]}
      onAdd={({ floors }) => addFloor(propertyId, floors)}
    />
  );
}

export function RemoveFloorButton({
  floorId,
  label,
  unitCount,
  overlay = false,
}: {
  floorId: string;
  label: string;
  unitCount: number;
  /** A bin icon for the floor list's hover actions. */
  overlay?: boolean;
}) {
  const [pending, run] = useUnitAction();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={overlay ? `Remove ${label}` : undefined}
      title={overlay ? `Remove ${label}` : undefined}
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            unitCount
              ? `Remove ${label} and its ${unitCount} ${unitCount === 1 ? "unit" : "units"}? This cannot be undone.`
              : `Remove ${label}?`,
          )
        )
          return;
        run(() => deleteFloor(floorId));
      }}
      className={
        overlay
          ? "size-7 rounded-md border border-border bg-card p-0 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
          : "gap-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      }
    >
      <Trash2 aria-hidden="true" className="size-4" />
      {overlay ? null : pending ? "Removing…" : "Remove floor"}
    </Button>
  );
}

export function RenameFloorButton({ floorId, label }: { floorId: string; label: string }) {
  const [pending, run] = useUnitAction();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Rename ${label}`}
      title={`Rename ${label}`}
      disabled={pending}
      onClick={() => {
        const next = window.prompt("Floor name", label)?.trim();
        if (!next || next === label) return;
        run(() => renameFloor(floorId, next));
      }}
      className="size-7 rounded-md border border-border bg-card p-0 text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary disabled:opacity-60"
    >
      <PenLine aria-hidden="true" className="size-4" />
    </Button>
  );
}

export function RenameUnitButton({
  unitId,
  code,
  showLabel = false,
}: {
  unitId: string;
  code: string;
  showLabel?: boolean;
}) {
  const [pending, run] = useUnitAction();
  return (
    <Button
      type="button"
      variant="ghost"
      size={showLabel ? "sm" : "icon"}
      aria-label={`Rename unit ${code}`}
      title="Rename unit"
      disabled={pending}
      onClick={() => {
        const next = window.prompt("Unit name", code)?.trim();
        if (!next || next === code) return;
        run(() => renameUnit(unitId, next));
      }}
      className={cn(
        showLabel ? "gap-2" : "size-7",
        "rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-60",
      )}
    >
      <PenLine aria-hidden="true" className="size-4" />
      {showLabel && "Rename"}
    </Button>
  );
}
