"use client";

import { cn } from "@/lib/utils/cn";
import { footprint, type FloorLayout, type UnitDesign } from "../lib/floor-layout";
import { unitStatusLabel } from "../lib/unit-codes";
import { PlacedLabel, SpaceArt, UnitArt, itemTransform } from "./layout-art";
import type { UnitGroup } from "../lib/floor-groups";

export type PickerUnit = {
  id: string;
  code: string;
  status: string;
  accessible: boolean;
  group?: UnitGroup | null;
};

/** A designed floor where each unit is clicked to give it or hold it back. */
export function LayoutUnitPicker({
  layout,
  designs,
  units,
  isGranted,
  isHeldBack,
  onToggle,
  disabled = false,
}: {
  layout: FloorLayout;
  designs: Readonly<Record<string, UnitDesign>>;
  units: PickerUnit[];
  isGranted: (unitId: string) => boolean;
  isHeldBack: (unitId: string) => boolean;
  onToggle: (unitId: string) => void;
  disabled?: boolean;
}) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const pad = 0.4;

  return (
    <svg
      role="group"
      aria-label="Floor plan: pick units to give"
      viewBox={`${-pad} ${-pad} ${layout.width + pad * 2} ${layout.depth + pad * 2}`}
      className="block h-auto w-full"
    >
      <rect width={layout.width} height={layout.depth} className="fill-muted/30" />
      {layout.spaces.map((space) => (
        <g key={space.id} transform={itemTransform(space)}>
          <SpaceArt kind={space.kind} w={space.w} h={space.h} />
        </g>
      ))}
      {layout.units.map((placement) => {
        const unit = placement.unitId ? byId.get(placement.unitId) : undefined;
        const design = designs[placement.typeId];
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
        const given = isGranted(unit.id);
        const heldBack = isHeldBack(unit.id);
        const locked = disabled || !unit.accessible;
        const state = !unit.accessible
          ? "Not yours to share"
          : heldBack
            ? "Held back"
            : given
              ? "Given"
              : [unit.group?.name, unitStatusLabel(unit.status)].filter(Boolean).join(" · ");
        return (
          <g
            key={placement.id}
            role="checkbox"
            aria-checked={given}
            aria-disabled={locked}
            aria-label={`Unit ${unit.code}, ${state}`}
            tabIndex={locked ? -1 : 0}
            className={cn(
              "outline-none [&:focus-visible>.ring]:stroke-primary [&:focus-visible>.ring]:[stroke-width:4]",
              locked ? "cursor-not-allowed opacity-40" : "cursor-pointer",
            )}
            onClick={() => !locked && onToggle(unit.id)}
            onKeyDown={(event) => {
              if (locked || (event.key !== "Enter" && event.key !== " ")) return;
              event.preventDefault();
              onToggle(unit.id);
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
              className={cn(
                "ring transition-colors",
                heldBack
                  ? "fill-destructive/15 stroke-destructive"
                  : given
                    ? "fill-primary/20 stroke-primary"
                    : "fill-transparent stroke-foreground/40 hover:fill-primary/5",
              )}
              vectorEffect="non-scaling-stroke"
              strokeWidth={given || heldBack ? 3 : 1.5}
            />
            <g transform={`translate(${placement.x} ${placement.y})`}>
              <PlacedLabel code={unit.code} detail={state} w={fw} h={fh} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
