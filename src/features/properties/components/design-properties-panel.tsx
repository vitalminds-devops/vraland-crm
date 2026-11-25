"use client";

import { PencilRuler } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { type UnitTypeFacts, placeWithin } from "../lib/floor-layout";
import { type Piece, pieceName } from "../lib/floor-pieces";
import type { ParkingType } from "../lib/parking-types";
import { GeometryFields, MetreField, PanelSection, PieceActions } from "./geometry-fields";

const selectClass = "h-8 border-transparent bg-muted/60 text-[13px] shadow-none";

/**
 * Design floor's right sidebar, like Figma's: the picked piece's identifier, type, position and
 * size, or with nothing picked, the floor itself.
 */
export function DesignPropertiesPanel({
  picked,
  codes,
  unitTypes,
  parkingTypes,
  size,
  onResizeFloor,
  onChange,
  onDuplicate,
  onRemove,
  onEditType,
  floorDetails,
}: {
  picked: Piece[];
  codes: ReadonlyMap<string, string>;
  unitTypes: UnitTypeFacts[];
  parkingTypes: ParkingType[];
  size: { width: number; depth: number };
  onResizeFloor: (key: "width" | "depth", metres: number) => void;
  onChange: (piece: Piece) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onEditType: (type: UnitTypeFacts) => void;
  /** Shown with nothing picked: the identifier and copying to other floors. */
  floorDetails: ReactNode;
}) {
  const selected = picked.length === 1 ? picked[0]! : null;
  if (!picked.length)
    return (
      <>
        <PanelSection title="Floor size (m)">
          <div className="grid grid-cols-2 gap-2">
            <MetreField
              label="W"
              name="Floor width, in metres"
              value={size.width}
              min={4}
              max={200}
              onCommit={(metres) => onResizeFloor("width", metres)}
            />
            <MetreField
              label="H"
              name="Floor depth, in metres"
              value={size.depth}
              min={4}
              max={200}
              onCommit={(metres) => onResizeFloor("depth", metres)}
            />
          </div>
        </PanelSection>
        {floorDetails}
      </>
    );

  const type = selected?.kind === "unit" ? unitTypes.find((t) => t.id === selected.typeId) : null;
  const actions = (
    <PieceActions
      item={selected ?? undefined}
      width={size.width}
      depth={size.depth}
      canFlip={selected?.kind === "unit"}
      onChange={onChange}
      onDuplicate={onDuplicate}
      onRemove={onRemove}
    />
  );
  if (!selected) return <PanelSection title={`${picked.length} selected`}>{actions}</PanelSection>;

  const named = selected.kind === "unit" || selected.kind === "slot";
  return (
    <>
      <PanelSection title={pieceName(selected, codes.get(selected.id))}>
        {named && (
          <label className="grid gap-1 text-xs text-muted-foreground">
            Identifier
            <input
              value={codes.get(selected.id) ?? ""}
              onChange={(event) => onChange({ ...selected, code: event.target.value })}
              onKeyDown={(event) => event.stopPropagation()}
              maxLength={50}
              className="h-8 rounded-md border border-transparent bg-muted/60 px-2 text-[13px] font-semibold text-foreground tabular-nums hover:border-border focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            />
          </label>
        )}
        {selected.kind === "unit" && (
          // Another type gives the unit that type's rooms and size.
          <label className="grid gap-1 text-xs text-muted-foreground">
            Unit type
            <NativeSelect
              aria-label="Unit type"
              value={selected.typeId ?? ""}
              onChange={(event) => {
                const next = unitTypes.find((option) => option.id === event.target.value);
                if (next?.layout)
                  onChange(
                    placeWithin(
                      {
                        ...selected,
                        typeId: next.id,
                        w: next.layout.width,
                        h: next.layout.depth,
                        sized: undefined,
                      },
                      size.width,
                      size.depth,
                    ),
                  );
              }}
              className={selectClass}
            >
              {unitTypes
                .filter((option) => option.layout)
                .map((option) => (
                  <NativeSelectOption key={option.id} value={option.id}>
                    {option.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </label>
        )}
        {selected.kind === "slot" && parkingTypes.length > 0 && (
          // A slot joins a parking type here: its size now, its price on save.
          <label className="grid gap-1 text-xs text-muted-foreground">
            Parking type
            <NativeSelect
              aria-label="Parking type"
              value={selected.typeId ?? ""}
              onChange={(event) => {
                const next = parkingTypes.find((option) => option.id === event.target.value);
                onChange(
                  placeWithin(
                    next
                      ? { ...selected, typeId: next.id, w: next.w, h: next.h }
                      : { ...selected, typeId: undefined },
                    size.width,
                    size.depth,
                  ),
                );
              }}
              className={selectClass}
            >
              <NativeSelectOption value="">None</NativeSelectOption>
              {parkingTypes.map((option) => (
                <NativeSelectOption key={option.id} value={option.id}>
                  {option.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        )}
      </PanelSection>
      <PanelSection title="Position and size (m)">
        <GeometryFields item={selected} width={size.width} depth={size.depth} onChange={onChange} />
        {selected.sized && (
          <p className="text-xs text-muted-foreground">Resized; its type is still {type?.name}.</p>
        )}
      </PanelSection>
      <PanelSection>{actions}</PanelSection>
      {type && (
        <PanelSection>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 w-full gap-1.5"
            title="Double-click the unit"
            onClick={() => onEditType(type)}
          >
            <PencilRuler className="size-4" />
            Edit {type.name} rooms
          </Button>
        </PanelSection>
      )}
    </>
  );
}
