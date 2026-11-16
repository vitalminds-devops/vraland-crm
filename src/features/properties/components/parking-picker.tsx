"use client";

import { Car, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { unitStatusLabel, unitStatusToneFor } from "../lib/unit-codes";

/** Parking bays to tick for a partial grant; lit bays are given. */
export function ParkingPicker({
  slots,
  selectedIds,
  onToggle,
  disabled = false,
  selectionLabel = "given",
  availableOnly = true,
  compact = false,
}: {
  slots: { id: string; code: string; status: string; accessible: boolean }[];
  selectedIds: string[];
  onToggle: (slotId: string) => void;
  disabled?: boolean;
  selectionLabel?: "given" | "selected";
  availableOnly?: boolean;
  compact?: boolean;
}) {
  const selected = new Set(selectedIds);
  // Slots not shared with the viewer are left out entirely, unless already picked.
  const shown = slots.filter((slot) => slot.accessible || selected.has(slot.id));

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold">Parking</h3>
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {shown.filter((slot) => selected.has(slot.id)).length} of {shown.length}{" "}
            {selectionLabel}
          </span>
        </div>
      )}
      <ul
        className={
          compact
            ? "flex max-h-48 flex-wrap gap-2 overflow-y-auto p-1"
            : "grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 rounded-xl border border-border/60 bg-card p-3"
        }
      >
        {shown.map((slot) => {
          const on = selected.has(slot.id);
          const locked =
            disabled ||
            (!slot.accessible && !on) ||
            (availableOnly && slot.status !== "available" && !on);
          return (
            <li key={slot.id} className="min-w-0">
              <button
                type="button"
                aria-pressed={on}
                aria-label={`${slot.code}: ${unitStatusLabel(slot.status)}`}
                disabled={locked}
                onClick={() => onToggle(slot.id)}
                title={`${slot.code} · ${unitStatusLabel(slot.status)}`}
                className={cn(
                  compact
                    ? [
                        "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary/50 hover:bg-primary/5",
                      ]
                    : [
                        "relative grid min-h-32 min-w-0 w-full place-items-center gap-2 rounded-xl border p-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        on
                          ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/30",
                        locked && "cursor-not-allowed opacity-50",
                      ],
                )}
              >
                {compact ? (
                  on ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn("size-2.5 rounded-full border", unitStatusToneFor(slot.status))}
                    />
                  )
                ) : (
                  <>
                    {on && (
                      <Check
                        aria-hidden="true"
                        className="absolute top-2 right-2 size-4 text-primary"
                      />
                    )}
                    <Car
                      aria-hidden="true"
                      className="size-6 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                  </>
                )}
                <span className="max-w-full truncate">{slot.code}</span>
                {!compact && (
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-medium",
                      unitStatusToneFor(slot.status),
                    )}
                  >
                    {unitStatusLabel(slot.status)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
