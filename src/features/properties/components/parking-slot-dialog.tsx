"use client";

import { Car, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import { deleteParkingSlot, setParkingSlotStatus } from "../actions/parking.actions";
import { saveSlotPrices } from "../actions/prices.actions";
import {
  unitStatusLabel,
  unitStatusLabels,
  unitStatuses,
  unitStatusToneFor,
} from "../lib/unit-codes";
import { DetailList, FloorItemDialog } from "./floor-item-dialog";

type SlotAmounts = {
  /** What it costs: its own amount, else the property's. */
  price?: string | null;
  reservationFee?: string | null;
  /** Its own amounts only; null follows the property's. */
  ownPrice?: string | null;
  ownReservationFee?: string | null;
};

/** The same amount, with blank and null alike ("350000" equals "350000.00"). */
const sameAmount = (a: string | null | undefined, b: string | null | undefined) =>
  (a ? Number(a) : null) === (b ? Number(b) : null);

/** Room around the bay on its little stage, so its car and lines show whole. */
const MARGIN = 1.5;

/** A parking slot picked on the floor view, opened large like a unit: the bay in 3D, prices, status. */
export function ParkingSlotDialog({
  slot,
  size,
  floorLabel,
  currency,
  canManage,
  canManagePrices,
  onClose,
}: {
  slot: { id: string; code: string; status: string } & SlotAmounts;
  /** The bay's size on its floor, in metres. */
  size: { w: number; h: number };
  floorLabel: string;
  currency: string;
  canManage: boolean;
  /** Its own price and fee; without "Manage prices" they aren't offered. */
  canManagePrices: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [own, setOwn] = useState({
    price: slot.ownPrice ?? null,
    reservationFee: slot.ownReservationFee ?? null,
  });
  const changed =
    !sameAmount(own.price, slot.ownPrice) ||
    !sameAmount(own.reservationFee, slot.ownReservationFee);
  const taken = slot.status === "deposit_paid" || slot.status === "sold";
  const run = (action: () => Promise<{ success: boolean; message: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      notify(result.message, result.success ? "success" : "error");
      if (result.success) after?.();
    });

  return (
    <FloorItemDialog
      title={`Parking slot ${slot.code}`}
      subtitle={floorLabel}
      scene={{
        floorKey: slot.id,
        layout: {
          width: size.w + MARGIN * 2,
          depth: size.h + MARGIN * 2,
          units: [],
          spaces: [],
          parking: [
            {
              id: "slot",
              x: MARGIN,
              y: MARGIN,
              w: size.w,
              h: size.h,
              rotation: 0,
              slotId: slot.id,
            },
          ],
        },
        units: [],
        designs: new Map(),
        parking: [slot],
      }}
      flat={
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <Car aria-hidden="true" className="size-6" />
          {size.w} × {size.h} m
        </div>
      }
      onClose={onClose}
    >
      <DetailList
        rows={[
          ["Size", `${size.w} × ${size.h} m`],
          ["Price", formatMoney(slot.price, currency)],
          ["Reservation fee", formatMoney(slot.reservationFee, currency)],
        ]}
      />
      <div className="p-5">
        {canManage ? (
          <label className="grid gap-1 text-xs text-muted-foreground">
            Status
            <NativeSelect
              aria-label={`Parking slot ${slot.code} status`}
              value={slot.status}
              disabled={pending}
              className="h-9 border-border bg-background text-foreground"
              onChange={(event) => run(() => setParkingSlotStatus(slot.id, event.target.value))}
            >
              {unitStatuses.map((status) => (
                <NativeSelectOption key={status} value={status}>
                  {unitStatusLabels[status]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ) : (
          <span
            className={cn(
              "inline-block rounded-full border px-2.5 py-1 text-xs font-medium",
              unitStatusToneFor(slot.status),
            )}
          >
            {unitStatusLabel(slot.status)}
          </span>
        )}
      </div>
      {canManage && canManagePrices && (
        <form
          className="grid gap-2 border-t border-border/60 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              const result = await saveSlotPrices({ slotId: slot.id, ...own });
              return {
                success: result.success,
                message: result.success ? "Prices saved." : result.error.message,
              };
            });
          }}
        >
          <p className="text-xs font-medium">Prices</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Price
              <MoneyInput
                value={own.price}
                onValueChange={(next) => setOwn((current) => ({ ...current, price: next || null }))}
                placeholder="0.00"
                disabled={pending}
                className="h-9"
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Reservation fee
              <MoneyInput
                value={own.reservationFee}
                onValueChange={(next) =>
                  setOwn((current) => ({ ...current, reservationFee: next || null }))
                }
                placeholder="0.00"
                disabled={pending}
                className="h-9"
              />
            </label>
          </div>
          {changed && (
            <Button type="submit" size="sm" disabled={pending}>
              Save prices
            </Button>
          )}
        </form>
      )}
      {canManage && (
        <div className="mt-auto border-t border-border/60 p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-full gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={pending || taken}
            title={taken ? "Reserved and sold slots can't be removed" : undefined}
            onClick={() => {
              if (!window.confirm(`Remove parking slot ${slot.code}?`)) return;
              run(() => deleteParkingSlot(slot.id), onClose);
            }}
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
            Remove slot
          </Button>
        </div>
      )}
    </FloorItemDialog>
  );
}
