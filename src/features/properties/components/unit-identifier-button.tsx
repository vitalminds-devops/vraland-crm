"use client";

import { Hash } from "lucide-react";
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
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { applyIdentifiersToAllFloors } from "../actions/unit-identifier.actions";
import { saveUnitNaming } from "../actions/unit-naming.actions";
import { floorParkingCode } from "../lib/parking-codes";
import {
  floorCodes,
  identifierStyles,
  parseEndings,
  type UnitIdentifier,
} from "../lib/unit-identifier";
import { unitNamingSchema } from "../schemas/unit-naming.schema";

/** Design floor's Identifier button: how the property's units and parking are identified, applied to this floor. */
export function UnitIdentifierButton({
  propertyId,
  numbering,
  level,
  onApply,
}: {
  propertyId: string;
  numbering: UnitIdentifier;
  /** The floor being designed, so the examples and new codes use its number. */
  level: number;
  /** Renumbers this floor's units on the plan with the saved numbering. */
  onApply: (next: UnitIdentifier) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = identifierStyles.find((option) => option.value === numbering.style);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-9 gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Hash aria-hidden="true" className="size-4" />
        Identifier: {current?.label ?? "Numbers"}
      </Button>
      {open && (
        <IdentifierDialog
          propertyId={propertyId}
          numbering={numbering}
          level={level}
          onApply={onApply}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function IdentifierDialog({
  propertyId,
  numbering,
  level,
  onApply,
  onClose,
}: {
  propertyId: string;
  numbering: UnitIdentifier;
  level: number;
  onApply: (next: UnitIdentifier) => void;
  onClose: () => void;
}) {
  const [style, setStyle] = useState(numbering.style);
  const [endings, setEndings] = useState(numbering.endings.join(", "));
  const [parking, setParking] = useState(numbering.parking ?? "property");
  const [pending, startTransition] = useTransition();
  // Off renames this floor only; on renames every floor so the whole property reads the same.
  const [everyFloor, setEveryFloor] = useState(false);
  const typedEndings = parseEndings(endings);
  // Each style's first codes on this floor: 5A, 5B, 5C or 501, 502, 503.
  const example = (value: UnitIdentifier["style"], fallback: string) => {
    const sample = floorCodes(
      { ...numbering, style: value, endings: value === "custom" ? typedEndings : [] },
      level,
      3,
    );
    return sample.length ? `${sample.join(", ")}${value === "custom" ? " …" : ""}` : fallback;
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
          <DialogPopup
            aria-describedby={undefined}
            className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl"
          >
            <DialogTitle className="text-lg font-semibold">Unit identifier</DialogTitle>
            <p className="mt-1 text-[13px] text-muted-foreground">
              How units and parking are named, in their current order.
            </p>
            <form
              className="mt-4 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const input = { propertyId, style, parking, endings: typedEndings };
                const checked = unitNamingSchema.safeParse(input);
                if (!checked.success)
                  return notify(
                    checked.error.issues[0]?.message ?? "Check the identifier.",
                    "error",
                  );
                startTransition(async () => {
                  const result = await saveUnitNaming(input);
                  if (!result.success) {
                    notify(result.error.message, "error");
                    return;
                  }
                  if (everyFloor) {
                    const applied = await applyIdentifiersToAllFloors(propertyId);
                    if (!applied.success) {
                      notify(applied.error.message, "error");
                      return;
                    }
                    notify(
                      applied.data.skipped.length
                        ? `Identifier saved. Not enough endings for ${applied.data.skipped.join(", ")}.`
                        : "Identifier saved on every floor.",
                      applied.data.skipped.length ? "error" : "success",
                    );
                  } else notify("Identifier saved.", "success");
                  onApply({
                    ...numbering,
                    style,
                    parking,
                    endings: style === "custom" ? typedEndings : [],
                  });
                  onClose();
                });
              }}
            >
              <div
                role="radiogroup"
                aria-label="Identifier style"
                className="grid gap-2 sm:grid-cols-3"
              >
                {identifierStyles.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30",
                      style === option.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <input
                      type="radio"
                      name="unit-identifier"
                      value={option.value}
                      checked={style === option.value}
                      onChange={() => setStyle(option.value)}
                      className="sr-only"
                      disabled={pending}
                    />
                    <span className="text-[13px] font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {example(option.value, option.example)}
                    </span>
                  </label>
                ))}
              </div>
              {style === "custom" && (
                <label className="grid gap-1.5 text-[13px] font-medium">
                  Unit endings, in order
                  <Input
                    value={endings}
                    onChange={(event) => setEndings(event.target.value)}
                    placeholder="01, 03, 05"
                    disabled={pending}
                  />
                </label>
              )}
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-[13px] font-medium">Parking</legend>
                <div
                  role="radiogroup"
                  aria-label="Parking identifier"
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {(
                    [
                      { value: "property", label: "Whole property", example: "P1, P2, P3" },
                      {
                        value: "floor",
                        label: "By floor",
                        example: [1, 2, 3]
                          .map((position) =>
                            floorParkingCode({ ...numbering, style }, level, position),
                          )
                          .join(", "),
                      },
                    ] as const
                  ).map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        "flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/30",
                        parking === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="radio"
                        name="parking-identifier"
                        value={option.value}
                        checked={parking === option.value}
                        onChange={() => setParking(option.value)}
                        className="sr-only"
                        disabled={pending}
                      />
                      <span className="text-[13px] font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {option.example}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={everyFloor}
                  onChange={(event) => setEveryFloor(event.target.checked)}
                  disabled={pending}
                  className="size-4 accent-primary"
                />
                Apply to every floor
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
