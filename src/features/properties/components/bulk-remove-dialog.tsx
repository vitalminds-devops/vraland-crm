"use client";

import { LockKeyhole, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import type { ActionResult } from "@/lib/types/action-result";
import { isHeld, unitStatusLabel } from "../lib/unit-codes";

/** Reserved and sold items are part of a sale, so they can't be ticked for removal. */

/**
 * "Remove several": tick units or parking slots and remove them in one go. Reserved and sold
 * ones can't be ticked; the server still refuses any on an open opportunity.
 */
export function BulkRemoveDialog({
  noun,
  place,
  items,
  onRemove,
  open: openProp,
  onOpenChange,
}: {
  /** What is removed, singular and plural, e.g. ["unit", "units"]. */
  noun: [string, string];
  /** Where they are removed from, named in the title, e.g. "2nd Floor". */
  place?: string;
  /** `group` sorts the list into sections, e.g. "Units" and "Parking". */
  items: { id: string; code: string; status: string; group?: string }[];
  onRemove: (ids: string[]) => Promise<ActionResult<{ removed: number }>>;
  /** Opened from elsewhere (the Actions menu); then there is no trigger button here. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : ownOpen;
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setOwnOpen(next));
  // Each opening starts with nothing ticked.
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (open) setPicked(new Set());
  }
  const [pending, startTransition] = useTransition();
  const removable = items.filter((item) => !isHeld(item.status));
  const allPicked = removable.length > 0 && removable.every((item) => picked.has(item.id));
  const count = picked.size;
  const name = (n: number) => (n === 1 ? noun[0] : noun[1]);
  const groups = [...Map.groupBy(items, (item) => item.group ?? "").entries()];

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const remove = () => {
    if (!window.confirm(`Remove ${count} ${name(count)}? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await onRemove([...picked]);
      if (!result.success) return void notify(result.error.message, "error");
      notify(`${result.data.removed} ${name(result.data.removed)} removed.`, "success");
      setOpen(false);
    });
  };

  if (!items.length) return null;
  return (
    <>
      {!controlled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setPicked(new Set());
            setOpen(true);
          }}
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
          Remove several
        </Button>
      )}
      <Dialog open={open} onOpenChange={(next) => !next && !pending && setOpen(false)}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
            <DialogPopup className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-card shadow-xl">
              <header className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0 space-y-1">
                  <DialogTitle className="text-[15px] leading-6 font-semibold">
                    Remove {noun[1]}
                    {place && ` from ${place}`}
                  </DialogTitle>
                  <DialogDescription className="text-[13px] leading-5">
                    Select the {noun[1]} you want to remove.
                  </DialogDescription>
                </div>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-mt-1 -mr-1 size-9 shrink-0 text-muted-foreground"
                    disabled={pending}
                    aria-label="Close removal dialog"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </DialogClose>
              </header>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-y border-border/40 bg-muted/20 px-4 py-1">
                <p aria-live="polite" className="text-[12px] text-muted-foreground tabular-nums">
                  <span className="font-medium text-foreground">{count}</span> of {removable.length}{" "}
                  selected
                </p>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-[12px] font-medium">
                  <Checkbox
                    className="border-input shadow-none data-[state=checked]:border-primary"
                    checked={allPicked}
                    disabled={!removable.length || pending}
                    onCheckedChange={() =>
                      setPicked(allPicked ? new Set() : new Set(removable.map((item) => item.id)))
                    }
                  />
                  Select all
                </label>
              </div>
              <div
                aria-label={`Select ${noun[1]} to remove`}
                className="max-h-[min(40rem,65dvh)] min-h-0 flex-1 overflow-y-auto overscroll-contain"
              >
                {groups.map(([group, rows]) => (
                  <section key={group || "all"} aria-label={group || undefined}>
                    {group && (
                      <h3 className="sticky top-0 z-10 border-b border-border/40 bg-card/95 px-4 py-2 text-[12px] font-semibold text-muted-foreground backdrop-blur">
                        {group}
                        <span className="ml-1.5 font-normal tabular-nums">{rows.length}</span>
                      </h3>
                    )}
                    {/* Two columns on wider screens, so a full floor fits without long scrolling. */}
                    <ul className="grid divide-border/40 sm:grid-cols-2 [&>li]:border-b [&>li]:border-border/40 sm:[&>li:nth-child(odd)]:border-r">
                      {rows.map((item) => {
                        const fixed = isHeld(item.status);
                        return (
                          <li key={item.id}>
                            <label
                              className={cn(
                                "flex min-h-12 items-center gap-3 px-4 py-3 text-[13px] transition-colors",
                                fixed
                                  ? "cursor-not-allowed bg-muted/10 text-muted-foreground"
                                  : "cursor-pointer hover:bg-muted/40",
                                picked.has(item.id) && "bg-primary/5",
                              )}
                            >
                              <Checkbox
                                className="border-input shadow-none data-[state=checked]:border-primary"
                                checked={picked.has(item.id)}
                                disabled={fixed || pending}
                                onCheckedChange={() => toggle(item.id)}
                              />
                              <span className="min-w-0 flex-1 break-words font-medium">
                                {item.code}
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                                {fixed && <LockKeyhole aria-hidden="true" className="size-3" />}
                                {fixed
                                  ? `${unitStatusLabel(item.status)} · kept`
                                  : unitStatusLabel(item.status)}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
              <footer className="flex flex-col-reverse gap-2 border-t border-border/40 p-4 sm:flex-row sm:justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="danger"
                  className="gap-2 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                  disabled={!count || pending}
                  onClick={remove}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  {pending ? "Removing…" : count ? `Remove ${count} ${name(count)}` : "Remove"}
                </Button>
              </footer>
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>
    </>
  );
}
