"use client";

import { Minus, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { footprint, formatArea, type FloorLayout, type UnitDesign } from "../lib/floor-layout";
import { PlacedLabel, SpaceArt, UnitArt, itemTransform } from "./layout-art";

/** Strong enough to read each unit's status at a glance over its furniture. */
const statusTone: Record<string, string> = {
  available: "fill-emerald-500/15 stroke-emerald-600",
  deposit_paid: "fill-amber-400/25 stroke-amber-500",
  sold: "fill-rose-500/20 stroke-rose-600",
  inactive: "fill-muted/70 stroke-border",
};

export type LayoutUnit = {
  id: string;
  code: string;
  status: string;
  typeName: string | null;
  bedrooms: number | null;
  floorArea: number | null;
};

/** The floor as designed: every unit with its rooms, tinted by status, with number and size. */
export function FloorLayoutView({
  layout,
  label,
  units,
  designs,
  selectedUnitId,
  onSelect,
  children,
}: {
  layout: FloorLayout;
  label: string;
  /** Units the viewer may see; others show as plain blocks. */
  units: LayoutUnit[];
  designs: ReadonlyMap<string, UnitDesign>;
  selectedUnitId: string | null;
  onSelect: (unitId: string) => void;
  /** The selected unit's details, shown under the plan. */
  children?: ReactNode;
}) {
  const [zoom, setZoom] = useState(1);
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const pad = 0.4;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-1" aria-label="Zoom">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-8"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-8"
          aria-label="Zoom in"
          disabled={zoom >= 3}
          onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="overflow-auto rounded-xl border border-border/60 bg-card">
        <svg
          role="group"
          aria-label={`${label} plan`}
          viewBox={`${-pad} ${-pad} ${layout.width + pad * 2} ${layout.depth + pad * 2}`}
          className="block h-auto"
          style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 36}rem` }}
        >
          <rect width={layout.width} height={layout.depth} className="fill-muted/30" />
          {layout.spaces.map((space) => (
            <g key={space.id} transform={itemTransform(space)}>
              <SpaceArt kind={space.kind} w={space.w} h={space.h} />
            </g>
          ))}
          {layout.units.map((placement) => {
            const unit = placement.unitId ? byId.get(placement.unitId) : undefined;
            const design = designs.get(placement.typeId);
            const [fw, fh] = footprint(placement);
            if (!unit)
              return (
                <rect
                  key={placement.id}
                  x={placement.x}
                  y={placement.y}
                  width={fw}
                  height={fh}
                  className="fill-muted stroke-border"
                  vectorEffect="non-scaling-stroke"
                />
              );
            const selected = unit.id === selectedUnitId;
            const area = formatArea(unit.floorArea);
            const type = unit.bedrooms !== null ? `${unit.bedrooms} BR` : unit.typeName;
            return (
              <g
                key={placement.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={[`Unit ${unit.code}`, area, type].filter(Boolean).join(", ")}
                className="cursor-pointer outline-none [&:focus-visible>.ring]:stroke-primary"
                onClick={() => onSelect(unit.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(unit.id);
                  }
                }}
              >
                {design && (
                  <g transform={itemTransform(placement)}>
                    <UnitArt design={design} size={[placement.w, placement.h]} />
                  </g>
                )}
                <rect
                  x={placement.x}
                  y={placement.y}
                  width={fw}
                  height={fh}
                  className={cn("ring", statusTone[unit.status] ?? statusTone.inactive)}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={selected ? 4 : 2}
                />
                {selected && (
                  <rect
                    x={placement.x}
                    y={placement.y}
                    width={fw}
                    height={fh}
                    className="pointer-events-none fill-none stroke-primary"
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={3}
                  />
                )}
                <g transform={`translate(${placement.x} ${placement.y})`}>
                  <PlacedLabel
                    code={unit.code}
                    detail={[area, type].filter(Boolean).join(" · ")}
                    w={fw}
                    h={fh}
                  />
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      {children}
    </div>
  );
}
