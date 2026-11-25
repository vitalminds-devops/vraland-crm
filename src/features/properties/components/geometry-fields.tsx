"use client";

import { Copy, FlipHorizontal2, RotateCw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { type LayoutItem, MIN_PIECE, placeWithin, rotate } from "../lib/floor-layout";
import { MetreInput } from "./metre-input";

/** One group in a designer's properties panel, like Figma's right sidebar. */
export function PanelSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2.5 border-b border-border/60 px-3 py-3", className)}>
      {title && <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>}
      {children}
    </section>
  );
}

const fieldClass =
  "h-8 w-full rounded-md border-transparent bg-muted/60 px-2 text-[13px] tabular-nums shadow-none hover:border-border focus-visible:border-input [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** A small labelled metre field: "X 2", "W 8". */
export function MetreField({
  label,
  name,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  onCommit: (metres: number) => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="w-3 shrink-0 font-medium">{label}</span>
      <MetreInput
        aria-label={name}
        min={min}
        max={max}
        step={0.5}
        value={value}
        onCommit={onCommit}
        className={fieldClass}
      />
    </label>
  );
}

/** Where a piece sits and how big it is, in metres, on a canvas `width` × `depth`. */
export function GeometryFields<T extends LayoutItem>({
  item,
  width,
  depth,
  margin = 0,
  resizable = true,
  onChange,
}: {
  item: T;
  width: number;
  depth: number;
  margin?: number;
  resizable?: boolean;
  onChange: (item: T) => void;
}) {
  const place = (next: T) => onChange(placeWithin(next, width, depth, margin));
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
      <MetreField
        label="X"
        name="Left, in metres"
        value={item.x}
        min={-margin}
        max={width + margin}
        onCommit={(x) => place({ ...item, x })}
      />
      <MetreField
        label="Y"
        name="Top, in metres"
        value={item.y}
        min={-margin}
        max={depth + margin}
        onCommit={(y) => place({ ...item, y })}
      />
      {resizable && (
        <>
          <MetreField
            label="W"
            name="Width, in metres"
            value={item.w}
            min={MIN_PIECE}
            max={Math.max(width, depth) + margin * 2}
            onCommit={(w) => place({ ...item, w })}
          />
          <MetreField
            label="H"
            name="Height, in metres"
            value={item.h}
            min={MIN_PIECE}
            max={Math.max(width, depth) + margin * 2}
            onCommit={(h) => place({ ...item, h })}
          />
        </>
      )}
    </div>
  );
}

/** Rotate, Flip, Duplicate and Remove for the picked pieces; Rotate and Flip for one piece only. */
export function PieceActions<T extends LayoutItem & { flip?: boolean }>({
  item,
  width,
  depth,
  margin = 0,
  canFlip,
  onChange,
  onDuplicate,
  onRemove,
}: {
  /** The one picked piece; left out when several are picked. */
  item?: T;
  width: number;
  depth: number;
  margin?: number;
  canFlip?: boolean;
  onChange: (item: T) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const action = "h-8 justify-start gap-1.5 px-2 text-[13px]";
  return (
    <div className="grid grid-cols-2 gap-1">
      {item && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={action}
          title="Rotate (R)"
          onClick={() => onChange(placeWithin(rotate(item), width, depth, margin))}
        >
          <RotateCw className="size-4" />
          Rotate {item.rotation ? `${item.rotation}°` : ""}
        </Button>
      )}
      {item && canFlip && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(action, item.flip && "text-primary")}
          title="Flip (F)"
          aria-pressed={Boolean(item.flip)}
          onClick={() => onChange({ ...item, flip: !item.flip })}
        >
          <FlipHorizontal2 className="size-4" />
          Flip
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={action}
        title="Duplicate (Ctrl+D)"
        onClick={onDuplicate}
      >
        <Copy className="size-4" />
        Duplicate
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(action, "text-destructive")}
        title="Remove (Delete)"
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
        Remove
      </Button>
    </div>
  );
}
