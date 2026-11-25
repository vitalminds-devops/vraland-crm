"use client";

import { Check, ChevronDown, PenLine, Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { addFloor, renameFloor } from "../actions/unit.actions";
import { parseFloorNames } from "../lib/floor-names";
import type { UnitGroup } from "../lib/floor-groups";

type Floor = { id: string; label: string; unitCount?: number; sections?: UnitGroup[] };

/**
 * The floor switcher over the floor view: every floor with its unit count, a quick Rename on each,
 * and Add floors. Long lists scroll inside the menu.
 */
export function FloorMenu({
  propertyId,
  floors,
  current,
  onPick,
  canManage,
}: {
  propertyId: string;
  floors: Floor[];
  current: string | undefined;
  onPick: (id: string) => void;
  canManage: boolean;
}) {
  const [renaming, setRenaming] = useState<Floor | null>(null);
  const [adding, setAdding] = useState(false);
  // A press on a row's pencil renames that floor instead of switching to it.
  const editPress = useRef<Floor | null>(null);
  const active = floors.find((floor) => floor.id === current) ?? floors[0];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Floor"
          className="flex h-11 w-40 items-center justify-between gap-2 rounded-md bg-card px-3 text-[13px] font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none sm:h-9"
        >
          <span className="truncate">{active?.label}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="top"
          className="flex w-64 flex-col overflow-hidden p-0"
        >
          <div className="max-h-[min(22rem,60dvh)] overflow-y-auto overscroll-contain p-1">
            {floors.map((floor) => {
              const isActive = floor.id === active?.id;
              return (
                <DropdownMenuItem
                  key={floor.id}
                  onSelect={() => {
                    const editing = editPress.current;
                    editPress.current = null;
                    if (editing) setRenaming(editing);
                    else onPick(floor.id);
                  }}
                  className={cn("group min-h-9 pr-1", isActive && "font-medium")}
                >
                  <Check aria-hidden="true" className={isActive ? "opacity-100" : "opacity-0"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{floor.label}</span>
                    {floor.sections && floor.sections.length > 0 && (
                      <span className="block truncate text-[11px] font-medium">
                        {floor.sections.map((section, index) => (
                          <span key={section.name} style={{ color: section.hex }}>
                            {index > 0 && <span className="text-muted-foreground"> · </span>}
                            {section.name}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  {floor.unitCount !== undefined && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {floor.unitCount} {floor.unitCount === 1 ? "unit" : "units"}
                    </span>
                  )}
                  {canManage && (
                    // A mouse shortcut; keyboard and screen readers use the Rename item below.
                    <span
                      aria-hidden="true"
                      title="Rename"
                      onPointerDown={() => {
                        editPress.current = floor;
                      }}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-60 hover:bg-background hover:text-foreground hover:opacity-100 group-focus:opacity-100"
                    >
                      <PenLine aria-hidden="true" className="size-3.5" />
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
          {canManage && (
            <>
              <DropdownMenuSeparator className="my-0" />
              <div className="p-1">
                {active && (
                  <DropdownMenuItem onSelect={() => setRenaming(active)} className="min-h-9">
                    <PenLine aria-hidden="true" />
                    Rename {active.label}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setAdding(true)} className="min-h-9 text-primary">
                  <Plus aria-hidden="true" />
                  Add floors
                </DropdownMenuItem>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {renaming && (
        <FloorNameDialog
          title={`Rename ${renaming.label}`}
          label="Floor name"
          initial={renaming.label}
          submit="Save"
          onClose={() => setRenaming(null)}
          onSubmit={async (value) => {
            const name = value.trim().slice(0, 50);
            if (!name || name === renaming.label) return { success: true, message: "" };
            return renameFloor(renaming.id, name);
          }}
        />
      )}
      {adding && (
        <FloorNameDialog
          title="Add floors"
          label="Floor names"
          hint="Separate names with commas, e.g. Ground, Mezzanine, Roof deck"
          placeholder="Ground, Mezzanine, Roof deck"
          submit="Add"
          onClose={() => setAdding(false)}
          preview={(value) => parseFloorNames(value)}
          onSubmit={async (value) => {
            const names = parseFloorNames(value);
            if (!names.length) return { success: false, message: "Enter at least one floor name." };
            return addFloor(propertyId, names.length, 0, names);
          }}
        />
      )}
    </>
  );
}

/** A small modal with one text field, for renaming a floor or adding floors by name. */
function FloorNameDialog({
  title,
  label,
  hint,
  placeholder,
  initial = "",
  submit,
  preview,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  hint?: string;
  placeholder?: string;
  initial?: string;
  submit: string;
  /** The floors the text will make, shown under the field. */
  preview?: (value: string) => string[];
  onClose: () => void;
  onSubmit: (value: string) => Promise<{ success: boolean; message: string }>;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const shown = preview?.(value) ?? [];
  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
          <DialogPopup
            aria-describedby={undefined}
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
          >
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            <form
              className="mt-4 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const result = await onSubmit(value);
                  if (result.message) notify(result.message, result.success ? "success" : "error");
                  if (result.success) onClose();
                });
              }}
            >
              <label className="grid gap-1.5 text-sm font-medium">
                {label}
                <Input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={placeholder}
                  maxLength={preview ? 2000 : 50}
                  autoFocus
                  disabled={pending}
                />
                {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
              </label>
              {shown.length > 0 && (
                <ul aria-label="Floors to add" className="flex flex-wrap gap-1.5">
                  {shown.map((name) => (
                    <li key={name} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                      {name}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={pending || !value.trim() || (preview && !shown.length)}
                >
                  {pending
                    ? "Saving…"
                    : preview && shown.length > 1
                      ? `${submit} ${shown.length} floors`
                      : submit}
                </Button>
              </div>
            </form>
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
