"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { notify } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils/money";
import { deleteParkingType, saveParkingType } from "../actions/parking-type.actions";
import type { ParkingType } from "../lib/parking-types";
import { ParkingArt } from "./layout-art";

/** A slot type's picture: its bay drawn to scale. */
function ParkingThumbnail({ w, h }: { w: number; h: number }) {
  return (
    <svg viewBox={`-0.1 -0.1 ${w + 0.2} ${h + 0.2}`} className="size-12" aria-hidden="true">
      <ParkingArt kind="slot" w={w} h={h} />
    </svg>
  );
}

/** One parking type in the property's types list: its bay, size, prices, Edit and Remove. */
export function ParkingTypeRow({
  propertyId,
  currency,
  type,
  onEdit,
}: {
  propertyId: string;
  currency: string;
  type: ParkingType;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const remove = () => {
    if (!window.confirm(`Remove ${type.name}? Its slots stay, with their prices.`)) return;
    startTransition(async () => {
      const result = await deleteParkingType(propertyId, type.id);
      notify(
        result.success ? "Parking type removed." : result.error.message,
        result.success ? "success" : "error",
      );
    });
  };

  return (
    <li className="group relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted/50">
        <ParkingThumbnail w={type.w} h={type.h} />
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="block w-full truncate text-left text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary/40"
          onClick={onEdit}
        >
          {type.name}
        </button>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          Parking · {type.w} × {type.h} m
          {type.reservationFee && ` · Reservation ${formatMoney(type.reservationFee, currency)}`}
        </p>
        <p className="mt-0.5 text-xs font-medium tabular-nums">
          {type.price ? (
            formatMoney(type.price, currency)
          ) : (
            <span className="font-normal text-muted-foreground">No price</span>
          )}
        </p>
      </div>
      <div className="relative flex shrink-0 gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground hover:text-foreground"
          aria-label={`Edit ${type.name}`}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Remove ${type.name}`}
          disabled={pending}
          onClick={remove}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </li>
  );
}

/** Adds or edits a parking type: its name, size, price and reservation fee. */
export function ParkingTypeDialog({
  propertyId,
  type,
  onClose,
}: {
  propertyId: string;
  type: ParkingType | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    name: type?.name ?? "",
    w: String(type?.w ?? 2.5),
    h: String(type?.h ?? 5),
    price: type?.price ?? null,
    reservationFee: type?.reservationFee ?? null,
  });
  const [pending, startTransition] = useTransition();
  const w = Number(draft.w);
  const h = Number(draft.h);
  const drawable = w >= 1 && w <= 8 && h >= 2 && h <= 15;

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
          <DialogPopup className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <DialogTitle className="text-lg font-semibold">
              {type ? `Edit ${type.name}` : "Design parking"}
            </DialogTitle>
            <form
              className="mt-4 grid gap-4 sm:grid-cols-[6rem_minmax(0,1fr)]"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const result = await saveParkingType({ propertyId, id: type?.id, ...draft });
                  notify(
                    result.success ? "Parking type saved." : result.error.message,
                    result.success ? "success" : "error",
                  );
                  if (result.success) onClose();
                });
              }}
            >
              <div className="grid place-items-center rounded-lg bg-muted/40 p-2">
                {drawable ? (
                  <svg viewBox={`-0.1 -0.1 ${w + 0.2} ${h + 0.2}`} className="h-28 w-full">
                    <ParkingArt kind="slot" w={w} h={h} />
                  </svg>
                ) : null}
              </div>
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-sm font-medium">
                  Name
                  <Input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    placeholder="e.g. Standard, Tandem"
                    maxLength={40}
                    autoFocus
                    disabled={pending}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1.5 text-sm font-medium">
                    Width (m)
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={1}
                      max={8}
                      value={draft.w}
                      onChange={(event) => setDraft({ ...draft, w: event.target.value })}
                      disabled={pending}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Length (m)
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={2}
                      max={15}
                      value={draft.h}
                      onChange={(event) => setDraft({ ...draft, h: event.target.value })}
                      disabled={pending}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Price
                    <MoneyInput
                      value={draft.price}
                      onValueChange={(next) => setDraft({ ...draft, price: next || null })}
                      placeholder="0.00"
                      disabled={pending}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Reservation fee
                    <MoneyInput
                      value={draft.reservationFee}
                      onValueChange={(next) => setDraft({ ...draft, reservationFee: next || null })}
                      placeholder="0.00"
                      disabled={pending}
                    />
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={pending || !draft.name.trim()}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
