"use client";

import { Pencil, Plus } from "lucide-react";
import type { ReactNode } from "react";
import {
  type UnitTypeFacts,
  formatArea,
  parkingSpaceKinds,
  spaceKinds,
  spaceLabels,
  spaceSizes,
} from "../lib/floor-layout";
import { SLOT_SIZE } from "../lib/parking-layout";
import type { ParkingType } from "../lib/parking-types";
import { ParkingArt, SpaceArt, UnitThumbnail } from "./layout-art";
import { PaletteItem } from "./layout-palette";

function AssetSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="shrink-0 space-y-2 lg:border-b lg:border-border/60 lg:pb-4"
    >
      <div className="flex h-6 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
        {action}
      </div>
      <div className="flex items-start gap-2 lg:flex-col lg:items-stretch">{children}</div>
    </section>
  );
}

/**
 * Design floor's Assets: unit types (drag one in, or edit and add types right here), shared
 * spaces and parking. Like Figma's assets, each one is dragged onto the canvas.
 */
export function DesignAssetsPanel({
  unitTypes,
  parkingTypes,
  onAdd,
  onEditType,
}: {
  unitTypes: UnitTypeFacts[];
  parkingTypes: ParkingType[];
  onAdd: (key: string) => void;
  /** Opens a unit type's rooms in place; null starts a new type. */
  onEditType?: (type: UnitTypeFacts | null) => void;
}) {
  return (
    <>
      <AssetSection
        title="Unit types"
        action={
          onEditType && (
            <button
              type="button"
              aria-label="New unit type"
              title="New unit type"
              onClick={() => onEditType(null)}
              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-4" />
            </button>
          )
        }
      >
        {unitTypes.map((type) =>
          type.layout ? (
            <div key={type.id} className="group relative shrink-0">
              <PaletteItem
                pieceKey={type.id}
                title={type.name}
                detail={
                  formatArea(type.floorArea === null ? null : Number(type.floorArea)) ?? undefined
                }
                art={<UnitThumbnail design={type.layout} className="size-9" />}
                onAdd={() => onAdd(type.id)}
              />
              {onEditType && (
                <button
                  type="button"
                  aria-label={`Edit ${type.name}`}
                  title="Edit rooms"
                  onClick={() => onEditType(type)}
                  className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-md bg-card text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>
          ) : (
            onEditType && (
              <button
                key={type.id}
                type="button"
                onClick={() => onEditType(type)}
                className="flex min-h-14 w-40 shrink-0 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-left text-[13px] hover:bg-muted/50 lg:w-full"
              >
                <Pencil className="size-4 text-muted-foreground" />
                Design {type.name}
              </button>
            )
          ),
        )}
        {!unitTypes.length && (
          <p className="w-40 shrink-0 text-xs text-muted-foreground lg:w-auto">
            No unit types yet.
          </p>
        )}
      </AssetSection>
      <AssetSection title="Shared spaces">
        {spaceKinds
          .filter((kind) => !(parkingSpaceKinds as readonly string[]).includes(kind))
          .map((kind) => {
            const [w, h] = spaceSizes[kind];
            return (
              <PaletteItem
                key={kind}
                pieceKey={kind}
                title={spaceLabels[kind]}
                art={
                  <svg viewBox={`-0.1 -0.1 ${Math.min(w, 4) + 0.2} ${h + 0.2}`} className="size-9">
                    <SpaceArt kind={kind} w={Math.min(w, 4)} h={h} label={false} />
                  </svg>
                }
                onAdd={() => onAdd(kind)}
              />
            );
          })}
      </AssetSection>
      <AssetSection title="Parking slots">
        <PaletteItem
          pieceKey="slot"
          title="Parking slot"
          detail={`${SLOT_SIZE[0]} × ${SLOT_SIZE[1]} m`}
          art={
            <svg viewBox="-0.1 -0.1 2.7 5.2" className="size-9">
              <ParkingArt kind="slot" w={SLOT_SIZE[0]} h={SLOT_SIZE[1]} />
            </svg>
          }
          onAdd={() => onAdd("slot")}
        />
        {parkingTypes.map((parkingType) => (
          <PaletteItem
            key={parkingType.id}
            pieceKey={`parking:${parkingType.id}`}
            title={parkingType.name}
            detail={`${parkingType.w} × ${parkingType.h} m`}
            art={
              <svg
                viewBox={`-0.1 -0.1 ${parkingType.w + 0.2} ${parkingType.h + 0.2}`}
                className="size-9"
              >
                <ParkingArt kind="slot" w={parkingType.w} h={parkingType.h} />
              </svg>
            }
            onAdd={() => onAdd(`parking:${parkingType.id}`)}
          />
        ))}
      </AssetSection>
      <AssetSection title="Parking infrastructure">
        {parkingSpaceKinds.map((kind) => {
          const [w, h] = spaceSizes[kind];
          const shown = Math.min(w, 6);
          return (
            <PaletteItem
              key={kind}
              pieceKey={kind}
              title={spaceLabels[kind]}
              detail={`${w} × ${h} m`}
              art={
                <svg viewBox={`-0.1 -0.1 ${shown + 0.2} ${h + 0.2}`} className="size-9">
                  <ParkingArt kind={kind} w={shown} h={h} />
                </svg>
              }
              onAdd={() => onAdd(kind)}
            />
          );
        })}
      </AssetSection>
    </>
  );
}
