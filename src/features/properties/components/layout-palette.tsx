"use client";

import type { ReactNode } from "react";
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
