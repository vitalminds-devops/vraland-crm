"use client";

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
  type FloorLayout,
  type UnitTypeFacts,
  copyGroupBeside,
  fitPlacements,
  freeSpot,
  placeWithin,
  resolvePlacements,
  spaceKinds,
  spaceSizes,
} from "../lib/floor-layout";
import {
  type Piece,
  markSized,
  pieceName,
  refitType,
  toLayout,
  toPieces,
} from "../lib/floor-pieces";
import { floorCodes, nextFreeCode, type UnitNumbering } from "../lib/unit-numbering";
import { nextSlotCode, slotRenames } from "../lib/parking-codes";
import { SLOT_SIZE, floorWithParking, type ParkingLayout } from "../lib/parking-layout";
import type { ParkingType } from "../lib/parking-types";
import { CopyToFloors } from "./copy-to-floors";
import { DesignAssetsPanel } from "./design-assets-panel";
import { DesignLayersPanel } from "./design-layers-panel";
import { DesignPropertiesPanel } from "./design-properties-panel";
import { PanelSection } from "./geometry-fields";
import { LayoutCanvas } from "./layout-canvas";
import { ParkingArt, PlacedLabel, SpaceArt, UnitArt } from "./layout-art";
import { UnitNumberingButton } from "./unit-numbering-button";
import { UnitTypeWorkspace } from "./unit-type-workspace";
import { useLayoutHistory } from "./use-layout-history";

const newId = () => crypto.randomUUID().slice(0, 8);

/**
 * Build a floor like a Figma file: assets and layers on the left, the plan in the middle, the
 * picked piece's properties on the right. Double-clicking a unit opens its type's rooms in place.
 */
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
  canManagePrices = false,
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
  /** For the Identifier button and editing unit types in place. */
  propertyId?: string;
  /** For the unit type editor: without it, amounts show but can't be changed. */
  canManagePrices?: boolean;
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
  // Unit types edited here show on the plan at once, before the page reloads them.
  const [types, setTypes] = useState(unitTypes);
  // The unit type open in place; `type: null` is a new one.
  const [editing, setEditing] = useState<{ type: UnitTypeFacts | null } | null>(null);
  const [tab, setTab] = useState<"assets" | "layers">("assets");
  const [size, setSize] = useState({ width: start.width, depth: start.depth });
  // Undo and redo cover every change to the plan; the unit editor has its own while open.
  const history = useLayoutHistory<Piece[]>(() => toPieces(start), !editing);
  const pieces = history.value;
  const setPieces = history.set;
  // Several pieces can be picked to move, copy or remove together.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copyTo, setCopyTo] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const typeById = new Map(types.map((type) => [type.id, type]));
  const placed = pieces.filter((piece) => piece.kind === "unit");
  const picked = pieces.filter((piece) => selectedIds.includes(piece.id));

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
  // Parking slots number themselves the same way: across the property (P1, P2…) or by floor.
  const slots = pieces.filter((piece) => piece.kind === "slot");
  const resolvedSlots = resolvePlacements({
    placements: slots.map((piece) => ({ id: piece.id, unitId: piece.slotId ?? null })),
    floorUnits: floorSlots,
    previouslyPlaced: (floor.layout?.parking ?? []).flatMap((slot) =>
      slot.slotId ? [slot.slotId] : [],
    ),
    nextCode: (taken) => nextSlotCode(numbering, floor.level, [...otherSlotCodes, ...taken]),
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
    const base = { id: newId(), w, h, rotation: 0 as const, ...spot };
    const piece: Piece = type
      ? { ...base, kind: "unit", typeId: type.id, unitId: null, flip: false }
      : key === "slot" || parkingType
        ? { ...base, kind: "slot", slotId: null, typeId: parkingType?.id }
        : { ...base, kind: space! };
    setPieces([...pieces, placeWithin(piece, size.width, size.depth)]);
    setSelectedIds([piece.id]);
  };
  const resize = (key: "width" | "depth", metres: number) => {
    const next = { ...size, [key]: Math.min(200, Math.max(4, metres)) };
    setSize(next);
    setPieces(pieces.map((piece) => placeWithin(piece, next.width, next.depth)));
  };
  // A new numbering renames this floor's units on the plan, in their current order, and its
  // parking too when parking goes by floor.
  const renumber = (next: UnitNumbering) => {
    const order = [...placed].sort((a, b) =>
      (codes.get(a.id) ?? "").localeCompare(codes.get(b.id) ?? "", undefined, { numeric: true }),
    );
    const fresh = floorCodes(next, floor.level, order.length);
    const codeOf = new Map(order.map((piece, index) => [piece.id, fresh[index]]));
    if (next.parking === "floor")
      for (const rename of slotRenames(
        slots.map((piece) => ({ id: piece.id, code: codes.get(piece.id) ?? "" })),
        next,
        floor.level,
      ))
        codeOf.set(rename.id, rename.code);
    setPieces(
      pieces.map((piece) =>
        codeOf.get(piece.id) ? { ...piece, code: codeOf.get(piece.id) } : piece,
      ),
    );
  };
  const sizedTo = (piece: Piece) => markSized(piece, typeById.get(piece.typeId ?? "")?.layout);
  const change = (next: Piece) =>
    setPieces(pieces.map((piece) => (piece.id === next.id ? sizedTo(next) : piece)));
  // Opens a unit's type in place; other pieces have nothing inside, so the canvas zooms instead.
  const open = (piece: Piece) => {
    const type = piece.kind === "unit" ? typeById.get(piece.typeId ?? "") : undefined;
    if (!type || !propertyId) return false;
    setEditing({ type });
    return true;
  };

  const save = () => {
    const replacing = otherFloors.filter((other) => copyTo.has(other.id) && other.hasLayout);
    if (
      replacing.length &&
      !window.confirm(`Replace the layout on ${replacing.map((other) => other.label).join(", ")}?`)
    )
      return;
    startTransition(async () => {
      const result = await saveFloorLayout({
        floorId: floor.id,
        layout: toLayout(size, pieces),
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
    <Dialog open onOpenChange={(next) => !next && !pending && !editing && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50">
          {/* The whole window, like an editing app: the plan gets every pixel. */}
          <DialogPopup
            aria-describedby={undefined}
            className="flex h-dvh w-full flex-col overflow-hidden bg-card"
          >
            <header className="flex items-center gap-3 border-b border-border px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-base font-semibold">
                  Design {floor.label}
                </DialogTitle>
                <p className="truncate text-xs text-muted-foreground tabular-nums">
                  {placed.length} {placed.length === 1 ? "unit" : "units"}
                  {slots.length > 0 &&
                    ` · ${slots.length} parking ${slots.length === 1 ? "slot" : "slots"}`}
                  {spare > 0 && ` · ${spare} not placed yet`}
                </p>
              </div>
              {!editing && (
                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary" disabled={pending}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="button" disabled={pending} onClick={save}>
                    {pending ? "Saving…" : copyTo.size ? `Save ${copyTo.size + 1} floors` : "Save"}
                  </Button>
                </div>
              )}
            </header>

            {editing && propertyId ? (
              <UnitTypeWorkspace
                propertyId={propertyId}
                type={editing.type}
                parentLabel={floor.label}
                canManagePrices={canManagePrices}
                onBack={() => setEditing(null)}
                onSaved={(saved) => {
                  setTypes((current) =>
                    current.some((type) => type.id === saved.id)
                      ? current.map((type) => (type.id === saved.id ? saved : type))
                      : [...current, saved],
                  );
                  if (saved.layout) setPieces(refitType(pieces, saved.id, saved.layout, size));
                  setEditing(null);
                }}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                <aside
                  aria-label="Assets and layers"
                  className="flex shrink-0 flex-col border-b border-border lg:w-60 lg:border-r lg:border-b-0"
                >
                  <div role="tablist" className="flex gap-1 border-b border-border/60 px-3 py-2">
                    {(["assets", "layers"] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={cn(
                          "h-7 rounded-md px-2.5 text-[13px] font-medium",
                          tab === key
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {key === "assets" ? "Assets" : "Layers"}
                      </button>
                    ))}
                  </div>
                  <div
                    role="tabpanel"
                    className={cn(
                      "flex min-h-0 flex-1 p-3",
                      tab === "assets"
                        ? "gap-5 overflow-x-auto lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto"
                        : "max-h-[30dvh] flex-col overflow-y-auto lg:max-h-none",
                    )}
                  >
                    {tab === "assets" ? (
                      <DesignAssetsPanel
                        unitTypes={types}
                        parkingTypes={parkingTypes}
                        onAdd={add}
                        onEditType={propertyId ? (type) => setEditing({ type }) : undefined}
                      />
                    ) : (
                      <DesignLayersPanel
                        rows={pieces.map((piece) => ({
                          piece,
                          name: pieceName(piece, codes.get(piece.id)),
                          detail:
                            piece.kind === "unit"
                              ? typeById.get(piece.typeId ?? "")?.name
                              : undefined,
                        }))}
                        selectedIds={selectedIds}
                        onSelect={setSelectedIds}
                        onOpen={open}
                      />
                    )}
                  </div>
                </aside>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-4">
                  <LayoutCanvas
                    toolbar={
                      <p className="text-xs text-muted-foreground">
                        Double-click a unit to edit its rooms.
                      </p>
                    }
                    width={size.width}
                    depth={size.depth}
                    items={pieces}
                    onChange={(next) => setPieces(next.map(sizedTo))}
                    render={(piece) => {
                      if (piece.kind === "slot")
                        return <ParkingArt kind="slot" w={piece.w} h={piece.h} />;
                      if (piece.kind !== "unit")
                        return <SpaceArt kind={piece.kind} w={piece.w} h={piece.h} />;
                      const design = typeById.get(piece.typeId!)?.layout;
                      return design ? (
                        <UnitArt design={design} size={[piece.w, piece.h]} />
                      ) : (
                        <rect
                          width={piece.w}
                          height={piece.h}
                          className="fill-muted stroke-foreground/40"
                        />
                      );
                    }}
                    label={(piece, [fw, fh]) =>
                      (piece.kind === "unit" || piece.kind === "slot") && (
                        <PlacedLabel
                          code={codes.get(piece.id) ?? ""}
                          detail={
                            piece.kind === "unit" ? (typeById.get(piece.typeId!)?.name ?? "") : ""
                          }
                          w={fw}
                          h={fh}
                        />
                      )
                    }
                    // A resized unit keeps its own size; its type (area, price) stays the same.
                    resizable={() => true}
                    flippable={(piece) => piece.kind === "unit"}
                    onOpen={open}
                    selectedIds={selectedIds}
                    onSelect={setSelectedIds}
                    onDropPiece={(key, x, y) => add(key, { x, y })}
                    ariaLabel={`${floor.label} layout`}
                    history={history}
                  />
                </div>
                <aside
                  aria-label="Properties"
                  className="max-h-[40dvh] shrink-0 overflow-y-auto border-t border-border lg:max-h-none lg:w-64 lg:border-t-0 lg:border-l"
                >
                  <DesignPropertiesPanel
                    picked={picked}
                    codes={codes}
                    unitTypes={types}
                    parkingTypes={parkingTypes}
                    size={size}
                    onResizeFloor={resize}
                    onChange={change}
                    onDuplicate={() => {
                      const copies = copyGroupBeside(picked, size.width, size.depth, newId);
                      setPieces([...pieces, ...copies]);
                      setSelectedIds(copies.map((copy) => copy.id));
                    }}
                    onRemove={() => {
                      setPieces(pieces.filter((piece) => !selectedIds.includes(piece.id)));
                      setSelectedIds([]);
                    }}
                    onEditType={(type) => setEditing({ type })}
                    floorDetails={
                      <>
                        {propertyId && (
                          <PanelSection title="Identifier">
                            <UnitNumberingButton
                              propertyId={propertyId}
                              numbering={numbering}
                              level={floor.level}
                              onApply={renumber}
                            />
                          </PanelSection>
                        )}
                        <CopyToFloors floors={otherFloors} picked={copyTo} onChange={setCopyTo} />
                      </>
                    }
                  />
                </aside>
              </div>
            )}
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
