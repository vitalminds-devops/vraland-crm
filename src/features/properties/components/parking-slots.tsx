"use client";

import { Car, ChevronLeft, ChevronRight, PenLine, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState, useTransition } from "react";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import {
  addParkingSlot,
  assignParkingSlotFloor,
  deleteParkingSlot,
  renameParkingSlot,
  setParkingSlotStatus,
} from "../actions/parking.actions";
import { unitStatusLabel, unitStatusLabels, unitStatuses } from "../lib/unit-codes";
import { UnitStatusLegend } from "./unit-grid";
import { AddCountDialog } from "./add-count-dialog";
import styles from "./parking-slots.module.css";

export type ParkingSlot = { id: string; code: string; status: string; floorId?: string | null };
type ParkingFloor = { id: string; label: string; level?: number };
type View = "3d" | "top" | "list";
const useParkingView = create<{ view: View; setView: (view: View) => void }>((set) => ({
  view: "list",
  setView: (view) => set({ view }),
}));
// Keep floor choices available to both the scene and list controls.
const useParkingFloors = create<{ floors: ParkingFloor[] }>(() => ({ floors: [] }));
const NO_FLOOR = "none";
const ParkingScene = dynamic(() => import("./parking-scene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[560px] place-items-center text-sm text-muted-foreground">
      Loading 3D parking…
    </div>
  ),
});

function useParkingAction() {
  const [pending, startTransition] = useTransition();
  const run = (
    action: () => Promise<{ success: boolean; message: string }>,
    onSuccess?: () => void,
  ) =>
    startTransition(async () => {
      try {
        const response = await action();
        notify(response.message, response.success ? "success" : "error");
        if (response.success) onSuccess?.();
      } catch {
        notify("Parking could not be updated. Try again.", "error");
      }
    });
  return [pending, run] as const;
}

export function ParkingSlots({
  propertyId,
  slots: allSlots,
  floors = [],
  canManage = false,
}: {
  propertyId: string;
  slots: ParkingSlot[];
  /** The property's floors a slot can be assigned to, lowest first. */
  floors?: ParkingFloor[];
  canManage?: boolean;
}) {
  useEffect(() => useParkingFloors.setState({ floors }), [floors]);
  const countOn = (filter: string) =>
    allSlots.filter((slot) => (slot.floorId ?? NO_FLOOR) === filter).length;
  const choices = [
    ...floors.map((floor) => ({
      id: floor.id,
      label: floor.label,
      badge: floor.level === undefined ? "•" : String(floor.level),
    })),
    { id: NO_FLOOR, label: "No floor", badge: "–" },
  ];
  // Open on the first floor that has parking.
  const [floorFilter, setFloorFilter] = useState(
    () => (choices.find((choice) => countOn(choice.id) > 0) ?? choices[0]).id,
  );
  // Without floors there is no panel, so every slot shows.
  // The floor new slots go on; follows the floor being viewed.
  const [addTo, setAddTo] = useState(floorFilter);
  const [viewedFloor, setViewedFloor] = useState(floorFilter);
  if (viewedFloor !== floorFilter) {
    setViewedFloor(floorFilter);
    setAddTo(floorFilter);
  }
  const slots = floors.length
    ? allSlots.filter((slot) => (slot.floorId ?? NO_FLOOR) === floorFilter)
    : allSlots;
  const available = slots.filter((slot) => slot.status === "available").length;
  const view = useParkingView((state) => state.view);
  const setView = useParkingView((state) => state.setView);
  const [page, setPage] = useState(0);
  const decks: ParkingSlot[][] = [];
  for (let index = 0; index < slots.length; index += 12) decks.push(slots.slice(index, index + 12));
  const activePage = Math.min(page, Math.max(0, decks.length - 1));

  const lot = (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] text-muted-foreground">
            {slots.length} {slots.length === 1 ? "slot" : "slots"} · {available} available
          </p>
        </div>
        {canManage && (
          <AddCountDialog
            label="Add parking"
            title="Add parking slots"
            fields={[{ name: "slots", label: "How many slots?", min: 1, initial: 1 }]}
            extra={
              floors.length > 0 && (
                <label className="grid gap-1.5 text-sm font-medium">
                  Floor
                  <NativeSelect value={addTo} onChange={(event) => setAddTo(event.target.value)}>
                    {choices.map((choice) => (
                      <NativeSelectOption key={choice.id} value={choice.id}>
                        {choice.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
              )
            }
            onAdd={async ({ slots: count }) => {
              const target = floors.length && addTo !== NO_FLOOR ? addTo : null;
              const result = await addParkingSlot(propertyId, target, count);
              // Show the floor the slots went to.
              if (result.success && floors.length) setFloorFilter(addTo);
              return result;
            }}
          />
        )}
      </div>
      {allSlots.length && !slots.length ? (
        <p className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-5 text-[13px] text-muted-foreground">
          No parking on this floor.
        </p>
      ) : slots.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <UnitStatusLegend />
            <div
              className="flex items-center gap-1 rounded-lg border border-border p-1"
              aria-label="Parking view"
            >
              {(
                [
                  ["list", "List"],
                  ["3d", "3D View"],
                  ["top", "Top View"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={view === value ? "primary" : "ghost"}
                  size="sm"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div
            role="region"
            aria-label="Parking floor plan"
            tabIndex={0}
            className={styles.viewport}
          >
            {view === "list" ? (
              <ul className={styles.list}>
                {slots.map((slot) => (
                  <ParkingBay key={slot.id} slot={slot} canManage={canManage} />
                ))}
              </ul>
            ) : (
              <ParkingScene
                slots={decks[activePage]}
                canManage={canManage}
                topView={view === "top"}
                onFallback={() => setView("list")}
              />
            )}
          </div>
          {view !== "list" && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <p>Drag to rotate · Scroll to zoom · Use List for keyboard navigation</p>
              {decks.length > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label="Previous parking area"
                    disabled={activePage === 0}
                    onClick={() => setPage(activePage - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span>
                    Area {activePage + 1} of {decks.length}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label="Next parking area"
                    disabled={activePage === decks.length - 1}
                    onClick={() => setPage(activePage + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-5 text-[13px] text-muted-foreground">
          No parking slots yet.
        </p>
      )}
    </div>
  );

  if (!floors.length || !allSlots.length) return lot;

  // Same floor panel as Floors & units: pick a floor on the left, see its parking on the right.
  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* lg:h-0 + min-h-full: the lot sets the row height and this panel fills it, scrolling its floors. */}
      <div className="flex min-w-0 flex-col self-start overflow-hidden rounded-xl border border-border/60 bg-muted/20 lg:h-0 lg:min-h-full lg:self-stretch">
        <div className="border-b border-border/40 py-2.5 pr-2 pl-4">
          <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Floors
          </h3>
        </div>
        <ul className="flex gap-1 overflow-x-auto p-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto">
          {choices.map((choice) => {
            const isActive = floorFilter === choice.id;
            return (
              <li key={choice.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setFloorFilter(choice.id);
                    setPage(0);
                  }}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:w-full",
                    isActive
                      ? "bg-primary font-medium text-primary-foreground shadow-xs"
                      : "text-foreground hover:bg-muted/60",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-md border text-[12px] font-semibold tabular-nums",
                      isActive
                        ? "border-white/30 bg-white/10"
                        : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {choice.badge}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                  <span
                    className={cn(
                      "min-w-6 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] tabular-nums",
                      isActive
                        ? "bg-white/15 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {countOn(choice.id)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="min-w-0 self-start rounded-xl border border-border/60 bg-muted/15 p-4 sm:p-5">
        {lot}
      </div>
    </div>
  );
}

export function ParkingBay({ slot, canManage }: { slot: ParkingSlot; canManage: boolean }) {
  const [pending, run] = useParkingAction();
  const [dialog, setDialog] = useState<"rename" | "remove" | null>(null);
  const [name, setName] = useState(slot.code);
  const floors = useParkingFloors((state) => state.floors);
  const [floorId, setFloorId] = useState(slot.floorId ?? NO_FLOOR);
  const floorLabel = floors.find((floor) => floor.id === slot.floorId)?.label;
  const taken = slot.status === "deposit_paid" || slot.status === "sold";
  return (
    <li
      className={styles.bay}
      data-status={slot.status}
      data-managed={canManage}
      data-taken={taken}
      aria-label={`Parking ${slot.code}: ${unitStatusLabel(slot.status)}`}
    >
      {canManage && (
        <NativeSelect
          aria-label={`Parking ${slot.code} status`}
          value={slot.status}
          disabled={pending}
          wrapperClassName={styles.statusControl}
          onChange={(event) => run(() => setParkingSlotStatus(slot.id, event.target.value))}
          className={styles.statusSelect}
        >
          {unitStatuses.map((status) => (
            <NativeSelectOption key={status} value={status} className="bg-white text-slate-900">
              {unitStatusLabels[status]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      <Car aria-hidden="true" className={styles.carIcon} strokeWidth={1.5} />
      <span className={styles.bayCode} title={slot.code}>
        {slot.code}
      </span>
      <span className={styles.bayStatus}>
        {unitStatusLabel(slot.status)}
        {floorLabel ? ` · ${floorLabel}` : ""}
      </span>
      {canManage && (
        <div className={styles.bayActions}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Rename parking ${slot.code}`}
            title="Edit slot"
            disabled={pending}
            onClick={() => {
              setName(slot.code);
              setFloorId(slot.floorId ?? NO_FLOOR);
              setDialog("rename");
            }}
            className={styles.iconButton}
          >
            <PenLine aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove parking ${slot.code}`}
            title={taken ? "Reserved or sold slots cannot be removed" : "Remove slot"}
            disabled={pending || taken}
            onClick={() => setDialog("remove")}
            className={styles.iconButton}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}
      {canManage && (
        <Dialog
          open={dialog !== null}
          onOpenChange={(open) => {
            if (!open && !pending) setDialog(null);
          }}
        >
          <DialogPortal>
            <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
              <DialogPopup className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
                <DialogTitle className="text-lg font-semibold">
                  {dialog === "rename"
                    ? `Edit parking ${slot.code}`
                    : `Remove parking ${slot.code}?`}
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm text-muted-foreground">
                  {dialog === "rename"
                    ? "Name and floor of this parking bay."
                    : "This permanently removes the parking slot. This cannot be undone."}
                </DialogDescription>
                <form
                  className="mt-4 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(
                      async () => {
                        if (dialog === "remove") return deleteParkingSlot(slot.id);
                        const nextFloor = floorId === NO_FLOOR ? null : floorId;
                        const renamed =
                          name.trim() === slot.code
                            ? null
                            : await renameParkingSlot(slot.id, name.trim());
                        if (renamed && !renamed.success) return renamed;
                        if (nextFloor !== (slot.floorId ?? null))
                          return assignParkingSlotFloor(slot.id, nextFloor);
                        return renamed ?? { success: true, message: "No change." };
                      },
                      () => setDialog(null),
                    );
                  }}
                >
                  {dialog === "rename" && (
                    <label className="grid gap-1.5 text-sm font-medium">
                      Slot name
                      <Input
                        required
                        maxLength={50}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        disabled={pending}
                        autoFocus
                      />
                    </label>
                  )}
                  {dialog === "rename" && floors.length > 0 && (
                    <label className="grid gap-1.5 text-sm font-medium">
                      Floor
                      <NativeSelect
                        value={floorId}
                        onChange={(event) => setFloorId(event.target.value)}
                        disabled={pending}
                      >
                        <NativeSelectOption value={NO_FLOOR}>No floor</NativeSelectOption>
                        {floors.map((floor) => (
                          <NativeSelectOption key={floor.id} value={floor.id}>
                            {floor.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </label>
                  )}
                  <div className="flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button type="button" variant="secondary" disabled={pending}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      type="submit"
                      variant={dialog === "remove" ? "danger" : "primary"}
                      disabled={pending || (dialog === "rename" && !name.trim())}
                    >
                      {pending ? "Saving…" : dialog === "rename" ? "Save" : "Remove slot"}
                    </Button>
                  </div>
                </form>
              </DialogPopup>
            </DialogOverlay>
          </DialogPortal>
        </Dialog>
      )}
    </li>
  );
}
