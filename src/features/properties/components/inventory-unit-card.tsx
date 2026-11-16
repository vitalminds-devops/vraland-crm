"use client";

import { Check, DoorOpen, Eye, ImagePlus, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { unitStatusLabel, unitStatusToneFor } from "../lib/unit-codes";

export function InventoryUnitCard({
  code,
  status,
  imageUrl,
  selected = false,
  heldBack = false,
  disabled = false,
  onToggle,
  selectionLabel,
  onPreview,
  onEditPicture,
  actions,
  statusControl,
  unavailableLabel,
}: {
  code: string;
  status: string;
  imageUrl: string | null;
  selected?: boolean;
  heldBack?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  selectionLabel?: string;
  onPreview?: () => void;
  onEditPicture?: () => void;
  actions?: ReactNode;
  statusControl?: ReactNode;
  unavailableLabel?: string;
}) {
  const selectionDisabled = disabled || (status !== "available" && !selected);
  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-colors focus-within:ring-2 focus-within:ring-primary/30",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : heldBack
            ? "border-destructive/50"
            : "border-border/70 hover:border-primary/40",
        selectionDisabled && onToggle && "opacity-60",
      )}
    >
      {onToggle && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selectionLabel ?? `Select unit ${code}`}
          disabled={selectionDisabled}
          onClick={onToggle}
          className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none disabled:cursor-not-allowed"
        />
      )}
      <div className="relative aspect-[16/10] overflow-hidden bg-muted/30">
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated inventory photos cannot use the image optimizer. */}
            <img
              src={imageUrl}
              alt={code}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            {onPreview && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={`Preview ${code} photo`}
                onClick={onPreview}
                className="absolute top-2 right-2 z-20 size-7 rounded-md bg-card"
              >
                <Eye aria-hidden="true" className="size-4" />
              </Button>
            )}
          </>
        ) : (
          <div className="grid h-full place-content-center gap-2 text-center text-muted-foreground">
            {onEditPicture ? (
              <Button
                type="button"
                variant="ghost"
                className="relative z-20 h-auto flex-col gap-2"
                aria-label={`Edit ${code} picture`}
                onClick={onEditPicture}
              >
                <ImagePlus aria-hidden="true" className="size-6" />
                <span className="text-xs">Add photo</span>
              </Button>
            ) : (
              <>
                <DoorOpen aria-hidden="true" className="mx-auto size-7" />
                <span className="text-xs">No photo</span>
              </>
            )}
          </div>
        )}
        {onToggle && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-2 left-2 grid size-5 place-items-center rounded border bg-card",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : heldBack
                  ? "border-destructive text-destructive"
                  : "border-border",
            )}
          >
            {selected ? (
              <Check className="size-3.5" />
            ) : heldBack ? (
              <Minus className="size-3.5" />
            ) : null}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 border-t border-border/40 p-3">
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{`Unit ${code}`}</span>
          <div className="relative z-20 flex shrink-0 items-center gap-1">
            {actions}
            {imageUrl && onEditPicture && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Edit ${code} picture`}
                onClick={onEditPicture}
              >
                <ImagePlus aria-hidden="true" className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {statusControl ? (
          <div className="relative z-20">{statusControl}</div>
        ) : (
          <span
            className={cn(
              "w-fit rounded-full border px-2 py-0.5 text-xs font-medium",
              unitStatusToneFor(status),
            )}
          >
            {unitStatusLabel(status)}
          </span>
        )}
        {(unavailableLabel || heldBack) && (
          <span className="text-xs text-muted-foreground">{unavailableLabel ?? "Held back"}</span>
        )}
      </div>
    </div>
  );
}
