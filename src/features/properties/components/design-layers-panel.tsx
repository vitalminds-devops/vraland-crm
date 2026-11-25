"use client";

import { Car, DoorOpen, Square } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Piece } from "../lib/floor-pieces";

export type LayerRow = { piece: Piece; name: string; detail?: string };

const groups = [
  { title: "Units", match: (piece: Piece) => piece.kind === "unit", Icon: DoorOpen },
  { title: "Parking", match: (piece: Piece) => piece.kind === "slot", Icon: Car },
  {
    title: "Spaces",
    match: (piece: Piece) => piece.kind !== "unit" && piece.kind !== "slot",
    Icon: Square,
  },
];

/**
 * Every piece on the floor, like Figma's layers: click to pick one, Shift or Ctrl + click to pick
 * several, double-click a unit to edit its rooms.
 */
export function DesignLayersPanel({
  rows,
  selectedIds,
  onSelect,
  onOpen,
}: {
  rows: LayerRow[];
  selectedIds: readonly string[];
  onSelect: (ids: string[]) => void;
  onOpen: (piece: Piece) => void;
}) {
  if (!rows.length)
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">Nothing on this floor yet.</p>
    );
  return (
    <div className="space-y-3">
      {groups.map(({ title, match, Icon }) => {
        const inGroup = rows
          .filter((row) => match(row.piece))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        if (!inGroup.length) return null;
        return (
          <section key={title} aria-label={title}>
            <h3 className="mb-1 flex justify-between px-2 text-xs font-semibold text-muted-foreground">
              {title}
              <span className="font-normal tabular-nums">{inGroup.length}</span>
            </h3>
            <ul>
              {inGroup.map(({ piece, name, detail }) => {
                const active = selectedIds.includes(piece.id);
                return (
                  <li key={piece.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={(event) =>
                        onSelect(
                          event.shiftKey || event.ctrlKey || event.metaKey
                            ? active
                              ? selectedIds.filter((id) => id !== piece.id)
                              : [...selectedIds, piece.id]
                            : [piece.id],
                        )
                      }
                      onDoubleClick={() => onOpen(piece)}
                      className={cn(
                        "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[13px]",
                        active ? "bg-primary/10 text-primary" : "hover:bg-muted",
                      )}
                    >
                      <Icon aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
                      <span className="truncate font-medium">{name}</span>
                      {detail && (
                        <span className="ml-auto truncate text-xs text-muted-foreground">
                          {detail}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
