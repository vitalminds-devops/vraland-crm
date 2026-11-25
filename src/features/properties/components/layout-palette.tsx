"use client";

import { FlipHorizontal2, RotateCw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PIECE_MIME } from "./layout-canvas";

/** A piece to drag onto the canvas; tapping it adds it in the first free spot instead. */
export function PaletteItem({
  pieceKey,
  title,
  detail,
  art,
  onAdd,
}: {
  pieceKey: string;
  title: string;
  detail?: string;
  art: ReactNode;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(PIECE_MIME, pieceKey);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onAdd}
      title={title}
      className="flex min-h-14 w-40 shrink-0 cursor-grab items-center gap-2.5 rounded-lg border border-border bg-card p-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:cursor-grabbing lg:w-full"
    >
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/50">
        {art}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] leading-4 break-words font-medium">{title}</span>
        {detail && (
          <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{detail}</span>
        )}
      </span>
    </button>
  );
}

/** The selected piece's name and its Rotate, Flip and Remove buttons. */
export function SelectionBar({
  name,
  onRotate,
  onFlip,
  onRemove,
  rename,
}: {
  name: string | null;
  /** A name field for the picked unit or slot. */
  rename?: { value: string; onChange: (value: string) => void; label: string };
  onRotate: () => void;
  onFlip?: () => void;
  onRemove: () => void;
}) {
  if (!name)
    return (
      <p className="h-8 text-xs leading-8 text-muted-foreground">Drag pieces onto the grid.</p>
    );
  return (
    <div className="flex h-8 items-center gap-1">
      {rename ? (
        <label className="mr-1 flex items-center gap-1.5 text-sm font-medium">
          {rename.label}
          <input
            value={rename.value}
            onChange={(event) => rename.onChange(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            maxLength={50}
            aria-label={`${rename.label} name`}
            className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm font-semibold tabular-nums focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          />
        </label>
      ) : (
        <span className="mr-1 truncate text-sm font-medium">{name}</span>
      )}
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onRotate}>
        <RotateCw className="size-4" />
        Rotate
      </Button>
      {onFlip && (
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onFlip}>
          <FlipHorizontal2 className="size-4" />
          Flip
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
        Remove
      </Button>
    </div>
  );
}
