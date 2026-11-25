"use client";

import { Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { saveFloorLayout } from "../actions/floor-layout.actions";
import {
  fitPlacements,
  formatArea,
  freeSpot,
  placeWithin,
  resolvePlacements,
  rotate,
  parkingSpaceKinds,
  spaceKinds,
  spaceLabels,
  spaceSizes,
  type FloorLayout,
  type Rotation,
  type SpaceKind,
  type UnitTypeFacts,
} from "../lib/floor-layout";
import { floorCodes, nextFreeCode, type UnitNumbering } from "../lib/unit-numbering";
import { nextParkingCode } from "../lib/parking-codes";
import { SLOT_SIZE, floorWithParking, type ParkingLayout } from "../lib/parking-layout";
import { LayoutCanvas } from "./layout-canvas";
import { MetreInput } from "./metre-input";
import { useLayoutHistory } from "./use-layout-history";
import { ParkingArt, PlacedLabel, SpaceArt, UnitArt, UnitThumbnail } from "./layout-art";
import { PaletteItem, SelectionBar } from "./layout-palette";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { UnitNumberingButton } from "./unit-numbering-button";
import type { ParkingType } from "../lib/parking-types";

type Piece = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: Rotation;
  flip?: boolean;
  kind: SpaceKind | "unit" | "slot";
  typeId?: string;
  unitId?: string | null;
  slotId?: string | null;
  /** A name typed for this unit or slot; saved with the floor. */
  code?: string;
};

const newId = () => crypto.randomUUID().slice(0, 8);

const toPieces = (layout: FloorLayout): Piece[] => [
  ...layout.spaces,
  ...layout.units.map((unit) => ({ ...unit, kind: "unit" as const })),
  ...(layout.parking ?? []).map((slot) => ({ ...slot, kind: "slot" as const })),
];

/** Build a floor by dragging designed units and shared spaces onto it; units number themselves. */
export function FloorDesigner({
  floor,
  otherFloors,
  floorUnits,
  unitTypes,
  numbering,
  floorSlots = [],
  otherSlotCodes = [],
  parkingTypes = [],
  propertyId,
  onClose,
}: {
  floor: {
    id: string;
    level: number;
    label: string;
    layout: FloorLayout | null;
    /** Parking from the old separate parking designer, brought onto this plan. */
    parkingLayout?: ParkingLayout | null;
  };
  otherFloors: { id: string; label: string; hasLayout: boolean }[];
  /** Units on this floor, in code order. */
  floorUnits: { id: string; code: string }[];
  unitTypes: UnitTypeFacts[];
  numbering: UnitNumbering;
  /** Parking slots on this floor, in code order. */
  floorSlots?: { id: string; code: string }[];
  /** Slot codes on other floors, which new slots skip. */
  otherSlotCodes?: string[];
  /** The property's parking types, dragged in like unit types. */
  parkingTypes?: ParkingType[];
  /** For the Identifier button, which saves how units are identified. */
  propertyId?: string;
  onClose: () => void;
}) {
  const slotIds = floorSlots.map((slot) => slot.id);
  const [start] = useState(() =>
    floor.layout
      ? fitPlacements(
          floorWithParking(floor.layout, floor.parkingLayout ?? null, slotIds),
          new Map(unitTypes.flatMap((type) => (type.layout ? [[type.id, type.layout]] : []))),
          parkingTypes,
        )
      : floorWithParking(null, floor.parkingLayout ?? null, slotIds),
  );
  const [size, setSize] = useState({ width: start.width, depth: start.depth });
  // Undo and redo cover every change to the plan, like an editing app.
  const history = useLayoutHistory<Piece[]>(() => toPieces(start));
  const pieces = history.value;
  const setPieces = history.set;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copyTo, setCopyTo] = useState<Set<string>>(new Set());
  const [showCopy, setShowCopy] = useState(false);
  const [pending, startTransition] = useTransition();
  const designed = unitTypes.filter((type) => type.layout);
  const typeById = new Map(unitTypes.map((type) => [type.id, type]));
  const placed = pieces.filter((piece) => piece.kind === "unit");
  const selected = pieces.find((piece) => piece.id === selectedId) ?? null;

  // The numbers the floor will give its units, worked out the same way the server does.
  const resolved = resolvePlacements({
    placements: placed.map((piece) => ({
      id: piece.id,
      unitId: piece.unitId ?? null,
      code: piece.code,
    })),
    floorUnits,
    previouslyPlaced: (floor.layout?.units ?? []).flatMap((unit) =>
      unit.unitId ? [unit.unitId] : [],
    ),
    nextCode: (taken) => nextFreeCode(numbering, floor.level, taken),
  });
  // Parking slots number themselves the same way, across the whole property (P1, P2…).
  const slots = pieces.filter((piece) => piece.kind === "slot");
  const resolvedSlots = resolvePlacements({
    placements: slots.map((piece) => ({ id: piece.id, unitId: piece.slotId ?? null })),
    floorUnits: floorSlots,
    previouslyPlaced: (floor.layout?.parking ?? []).flatMap((slot) =>
      slot.slotId ? [slot.slotId] : [],
    ),
    nextCode: (taken) => nextParkingCode([...otherSlotCodes, ...taken]),
  });
  const typed = new Map(pieces.flatMap((piece) => (piece.code ? [[piece.id, piece.code]] : [])));
  // A name typed on the plan wins over the one the numbering would give.
  const codes = new Map(
    [...resolved.assigned, ...resolvedSlots.assigned].map((entry) => [
      entry.placementId,
      typed.get(entry.placementId) ?? entry.code,
    ]),
  );
  const placedIds = new Set(resolved.assigned.map((entry) => entry.unitId));
  const spare = floorUnits.filter(
    (unit) => !placedIds.has(unit.id) && !resolved.removed.includes(unit.id),
  ).length;

  const add = (key: string, at?: { x: number; y: number }) => {
    const type = typeById.get(key);
    const parkingType = parkingTypes.find((option) => `parking:${option.id}` === key);
    const space = spaceKinds.find((kind) => kind === key);
    const [w, h] = type?.layout
      ? [type.layout.width, type.layout.depth]
      : parkingType
        ? [parkingType.w, parkingType.h]
        : key === "slot"
          ? SLOT_SIZE
          : space
            ? spaceSizes[space]
            : [0, 0];
    if (!w) return;
    const spot = at
      ? { x: at.x - w / 2, y: at.y - h / 2 }
      : freeSpot([w, h], pieces, size.width, size.depth);
    const piece: Piece = type
      ? {
          id: newId(),
          kind: "unit",
          typeId: type.id,
          unitId: null,
          flip: false,
          w,
          h,
          rotation: 0,
          ...spot,
        }
      : key === "slot" || parkingType
        ? {
            id: newId(),
            kind: "slot",
            slotId: null,
            typeId: parkingType?.id,
            w,
            h,
            rotation: 0,
            ...spot,
          }
        : { id: newId(), kind: space!, w, h, rotation: 0, ...spot };
    setPieces([...pieces, placeWithin(piece, size.width, size.depth)]);
    setSelectedId(piece.id);
  };
  const resize = (key: "width" | "depth", text: string) => {
    const next = { ...size, [key]: Math.min(200, Math.max(4, Number(text) || 4)) };
    setSize(next);
    setPieces(pieces.map((piece) => placeWithin(piece, next.width, next.depth)));
  };
  // A new numbering renames this floor's units on the plan, in their current order.
  const renumber = (next: UnitNumbering) => {
    const order = pieces
      .filter((piece) => piece.kind === "unit")
      .sort((a, b) =>
        (codes.get(a.id) ?? "").localeCompare(codes.get(b.id) ?? "", undefined, { numeric: true }),
      );
    const fresh = floorCodes(next, floor.level, order.length);
    const codeOf = new Map(order.map((piece, index) => [piece.id, fresh[index]]));
    setPieces(
      pieces.map((piece) =>
        codeOf.get(piece.id) ? { ...piece, code: codeOf.get(piece.id) } : piece,
      ),
    );
  };
  const change = (piece: Piece) =>
    setPieces(pieces.map((item) => (item.id === piece.id ? piece : item)));

  const save = () => {
    const replacing = otherFloors.filter((other) => copyTo.has(other.id) && other.hasLayout);
    if (
      replacing.length &&
      !window.confirm(`Replace the layout on ${replacing.map((other) => other.label).join(", ")}?`)
    )
      return;
    const layout: FloorLayout = {
      ...size,
      units: placed.map((piece) => ({
        id: piece.id,
        x: piece.x,
        y: piece.y,
        w: piece.w,
        h: piece.h,
        rotation: piece.rotation,
        flip: piece.flip ?? false,
        typeId: piece.typeId!,
        unitId: piece.unitId ?? null,
        code: piece.code,
      })),
      parking: slots.map(({ id, x, y, w, h, rotation, slotId, code, typeId }) => ({
        id,
        x,
        y,
        w,
        h,
        rotation,
        slotId: slotId ?? null,
        code,
        typeId,
      })),
      spaces: pieces.flatMap((piece) =>
        piece.kind === "unit" || piece.kind === "slot"
          ? []
          : [
              {
                id: piece.id,
                kind: piece.kind,
                x: piece.x,
                y: piece.y,
                w: piece.w,
                h: piece.h,
                rotation: piece.rotation,
              },
            ],
      ),
    };
    startTransition(async () => {
      const result = await saveFloorLayout({
        floorId: floor.id,
        layout,
        copyToFloorIds: [...copyTo],
      });
      if (!result.success) return void notify(result.error.message, "error");
      notify(
        result.data.floors > 1 ? `${result.data.floors} floors saved.` : `${floor.label} saved.`,
        "success",
      );
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50">
          {/* The whole window, like an editing app: the plan gets every pixel. */}
          <DialogPopup className="flex h-dvh w-full flex-col overflow-hidden bg-card">
            <header className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="min-w-40 flex-1">
                <DialogTitle className="text-lg font-semibold">Design {floor.label}</DialogTitle>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {placed.length} {placed.length === 1 ? "unit" : "units"}
                  {slots.length > 0 &&
                    ` · ${slots.length} parking ${slots.length === 1 ? "slot" : "slots"}`}
                  {spare > 0 && ` · ${spare} not placed yet`}
                </p>
              </div>
              {propertyId && (
                <UnitNumberingButton
                  propertyId={propertyId}
                  numbering={numbering}
                  level={floor.level}
                  onApply={renumber}
                />
              )}
              <fieldset className="grid gap-1 text-xs font-medium text-muted-foreground">
                <legend className="mb-1">Floor size (m)</legend>
                <div className="flex items-center gap-1.5">
                  <MetreInput
                    min={4}
                    max={200}
                    step={0.5}
                    aria-label="Floor width in metres"
                    value={size.width}
                    onCommit={(metres) => resize("width", String(metres))}
                    className="h-9 w-20 text-base text-foreground sm:text-sm"
                  />
                  <span aria-hidden="true">×</span>
                  <MetreInput
                    min={4}
                    max={200}
                    step={0.5}
                    aria-label="Floor depth in metres"
                    value={size.depth}
                    onCommit={(metres) => resize("depth", String(metres))}
                    className="h-9 w-20 text-base text-foreground sm:text-sm"
                  />
                </div>
              </fieldset>
            </header>

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <aside
                aria-label="Pieces"
                className="flex shrink-0 gap-5 overflow-x-auto border-b border-border p-3 lg:w-56 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-r lg:border-b-0"
              >
                <section aria-label="Unit types" className="shrink-0 space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground">Unit types</h3>
                  <div className="flex items-start gap-2 lg:flex-col lg:items-stretch">
                    {designed.length ? (
                      designed.map((type) => (
                        <PaletteItem
                          key={type.id}
                          pieceKey={type.id}
                          title={type.name}
                          detail={
                            formatArea(type.floorArea === null ? null : Number(type.floorArea)) ??
                            undefined
                          }
                          art={<UnitThumbnail design={type.layout!} className="size-9" />}
                          onAdd={() => add(type.id)}
                        />
                      ))
                    ) : (
                      <p className="w-40 shrink-0 text-xs text-muted-foreground lg:w-auto">
                        Design a unit first.
                      </p>
                    )}
                  </div>
                </section>
                <section
                  aria-label="Shared spaces"
                  className="shrink-0 space-y-2 lg:border-t lg:border-border/60 lg:pt-4"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground">Shared spaces</h3>
                  <div className="flex items-start gap-2 lg:flex-col lg:items-stretch">
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
                              <svg
                                viewBox={`-0.1 -0.1 ${Math.min(w, 4) + 0.2} ${h + 0.2}`}
                                className="size-9"
                              >
                                <SpaceArt kind={kind} w={Math.min(w, 4)} h={h} label={false} />
                              </svg>
                            }
                            onAdd={() => add(kind)}
                          />
                        );
                      })}
                  </div>
                </section>
                <section
                  aria-label="Parking slots"
                  className="shrink-0 space-y-2 lg:border-t lg:border-border/60 lg:pt-4"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground">Parking slots</h3>
                  <div className="flex items-start gap-2 lg:flex-col lg:items-stretch">
                    <PaletteItem
                      pieceKey="slot"
                      title="Parking slot"
                      detail={`${SLOT_SIZE[0]} × ${SLOT_SIZE[1]} m`}
                      art={
                        <svg viewBox="-0.1 -0.1 2.7 5.2" className="size-9">
                          <ParkingArt kind="slot" w={SLOT_SIZE[0]} h={SLOT_SIZE[1]} />
                        </svg>
                      }
                      onAdd={() => add("slot")}
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
                        onAdd={() => add(`parking:${parkingType.id}`)}
                      />
                    ))}
                  </div>
                </section>
                <section
                  aria-label="Parking infrastructure"
                  className="shrink-0 space-y-2 lg:border-t lg:border-border/60 lg:pt-4"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground">
                    Parking infrastructure
                  </h3>
                  <div className="flex items-start gap-2 lg:flex-col lg:items-stretch">
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
                          onAdd={() => add(kind)}
                        />
                      );
                    })}
                  </div>
                </section>
              </aside>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-4">
                <LayoutCanvas
                  toolbar={
                    <div className="flex flex-wrap items-center gap-2">
                      <SelectionBar
                        name={
                          selected
                            ? selected.kind === "unit"
                              ? `Unit ${codes.get(selected.id) ?? ""}`
                              : selected.kind === "slot"
                                ? `Parking ${codes.get(selected.id) ?? ""}`
                                : spaceLabels[selected.kind]
                            : null
                        }
                        rename={
                          selected && (selected.kind === "unit" || selected.kind === "slot")
                            ? {
                                label: selected.kind === "unit" ? "Unit" : "Parking",
                                value: codes.get(selected.id) ?? "",
                                onChange: (value) => change({ ...selected, code: value }),
                              }
                            : undefined
                        }
                        onRotate={() =>
                          selected && change(placeWithin(rotate(selected), size.width, size.depth))
                        }
                        onFlip={
                          selected?.kind === "unit"
                            ? () => change({ ...selected, flip: !selected.flip })
                            : undefined
                        }
                        onRemove={() => {
                          setPieces(pieces.filter((piece) => piece.id !== selectedId));
                          setSelectedId(null);
                        }}
                      />
                      {selected?.kind === "slot" && parkingTypes.length > 0 && (
                        // A slot joins a parking type here: its size now, its price on save.
                        <label className="flex items-center gap-1.5 text-sm font-medium">
                          Type
                          <NativeSelect
                            aria-label="Parking type"
                            value={selected.typeId ?? ""}
                            onChange={(event) => {
                              const type = parkingTypes.find(
                                (option) => option.id === event.target.value,
                              );
                              change(
                                placeWithin(
                                  type
                                    ? { ...selected, typeId: type.id, w: type.w, h: type.h }
                                    : { ...selected, typeId: undefined },
                                  size.width,
                                  size.depth,
                                ),
                              );
                            }}
                            wrapperClassName="w-40"
                            className="h-8 text-sm"
                          >
                            <NativeSelectOption value="">None</NativeSelectOption>
                            {parkingTypes.map((type) => (
                              <NativeSelectOption key={type.id} value={type.id}>
                                {type.name}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </label>
                      )}
                    </div>
                  }
                  width={size.width}
                  depth={size.depth}
                  items={pieces}
                  onChange={setPieces}
                  render={(piece) => {
                    if (piece.kind === "slot")
                      return <ParkingArt kind="slot" w={piece.w} h={piece.h} />;
                    if (piece.kind !== "unit")
                      return <SpaceArt kind={piece.kind} w={piece.w} h={piece.h} />;
                    const design = typeById.get(piece.typeId!)?.layout;
                    return design ? (
                      <UnitArt design={design} />
                    ) : (
                      <rect
                        width={piece.w}
                        height={piece.h}
                        className="fill-muted stroke-foreground/40"
                      />
                    );
                  }}
                  label={(piece, [fw, fh]) =>
                    piece.kind === "slot" ? (
                      <PlacedLabel code={codes.get(piece.id) ?? ""} detail="" w={fw} h={fh} />
                    ) : (
                      piece.kind === "unit" && (
                        <PlacedLabel
                          code={codes.get(piece.id) ?? ""}
                          detail={typeById.get(piece.typeId!)?.name ?? ""}
                          w={fw}
                          h={fh}
                        />
                      )
                    )
                  }
                  // Units take their type's size; parking slots and spaces can be any size.
                  resizable={(piece) => piece.kind !== "unit"}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onDropPiece={(key, x, y) => add(key, { x, y })}
                  ariaLabel={`${floor.label} layout`}
                  history={history}
                />
              </div>
            </div>

            {showCopy && otherFloors.length > 0 && (
              <fieldset className="max-h-40 overflow-y-auto border-t border-border px-4 py-3 sm:px-5">
                <legend className="sr-only">Floors with the same layout</legend>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Same layout on</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() =>
                      setCopyTo(
                        copyTo.size === otherFloors.length
                          ? new Set()
                          : new Set(otherFloors.map((other) => other.id)),
                      )
                    }
                  >
                    {copyTo.size === otherFloors.length ? "Clear" : "All floors"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-6">
                  {otherFloors.map((other) => (
                    <label
                      key={other.id}
                      className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={copyTo.has(other.id)}
                        onChange={() => {
                          const next = new Set(copyTo);
                          if (next.has(other.id)) next.delete(other.id);
                          else next.add(other.id);
                          setCopyTo(next);
                        }}
                        className="size-4 accent-primary"
                      />
                      {other.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
              {otherFloors.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className={cn("gap-2", copyTo.size > 0 && "text-primary")}
                  aria-expanded={showCopy}
                  onClick={() => setShowCopy(!showCopy)}
                >
                  <Copy className="size-4" />
                  {copyTo.size
                    ? `Also ${copyTo.size} ${copyTo.size === 1 ? "floor" : "floors"}`
                    : "Copy to floors"}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="button" disabled={pending} onClick={save}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </footer>
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
