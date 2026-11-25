"use client";

import { Tag } from "lucide-react";
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
import { FormSelect } from "@/components/ui/form-kit";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils/money";
import { saveUnitDetails } from "../actions/unit-type.actions";
import type { UnitTypeFacts } from "../lib/floor-layout";

/** Sets one unit's type, and its own size and price when they differ from its type's. */
export function UnitDetailsButton({
  unit,
  unitTypes,
  canManagePrices,
}: {
  unit: {
    id: string;
    code: string;
    unitTypeId: string | null;
    floorArea: string | null;
    price: string | null;
  };
  unitTypes: UnitTypeFacts[];
  /** Without "Manage prices", the price shows but can't be changed. */
  canManagePrices: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-2 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary"
        onClick={() => setOpen(true)}
      >
        <Tag aria-hidden="true" className="size-4" />
        Price & type
      </Button>
      {open && (
        <UnitDetailsDialog
          unit={unit}
          unitTypes={unitTypes}
          canManagePrices={canManagePrices}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function UnitDetailsDialog({
  unit,
  unitTypes,
  canManagePrices,
  onClose,
}: {
  unit: Parameters<typeof UnitDetailsButton>[0]["unit"];
  unitTypes: UnitTypeFacts[];
  canManagePrices: boolean;
  onClose: () => void;
}) {
  const [values, setValues] = useState({
    unitTypeId: unit.unitTypeId ?? "",
    floorArea: unit.floorArea ? String(Number(unit.floorArea)) : "",
    price: unit.price ? String(Number(unit.price)) : "",
  });
  const [pending, startTransition] = useTransition();
  const type = unitTypes.find((option) => option.id === values.unitTypeId);
  const set =
    (key: keyof typeof values) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues({ ...values, [key]: event.target.value });

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
          <DialogPopup
            aria-describedby={undefined}
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
          >
            <DialogTitle className="text-lg font-semibold">Unit {unit.code}</DialogTitle>
            <form
              className="mt-4 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const result = await saveUnitDetails({ unitId: unit.id, ...values });
                  if (!result.success) return void notify(result.error.message, "error");
                  notify("Unit saved.", "success");
                  onClose();
                });
              }}
            >
              <label className="grid gap-1.5 text-sm font-medium">
                Unit type
                <FormSelect value={values.unitTypeId} onChange={set("unitTypeId")}>
                  <option value="">No type</option>
                  {unitTypes.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </FormSelect>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Price
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={values.price}
                  onChange={set("price")}
                  disabled={!canManagePrices}
                  placeholder={type?.price ? `${formatMoney(type.price)} (type)` : undefined}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Size (sqm)
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={values.floorArea}
                  onChange={set("floorArea")}
                  placeholder={type?.floorArea ? `${Number(type.floorArea)} (type)` : undefined}
                />
              </label>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={pending}>
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
