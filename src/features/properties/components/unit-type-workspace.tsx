"use client";

import { ChevronRight } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { notify } from "@/components/ui/toast";
import { saveUnitType } from "../actions/unit-type.actions";
import {
  OVERHANG,
  type RoomKind,
  type UnitDesign,
  type UnitRoom,
  type UnitTypeFacts,
  copyGroupBeside,
  defaultUnitDesign,
  designFacts,
  formatArea,
  freeSpot,
  isDoor,
  placeWithin,
  roomKinds,
  roomLabels,
  roomMargin,
  roomSizes,
} from "../lib/floor-layout";
import { GeometryFields, MetreField, PanelSection, PieceActions } from "./geometry-fields";
import { RoomArt } from "./layout-art";
import { LayoutCanvas } from "./layout-canvas";
import { PaletteItem } from "./layout-palette";
import { useLayoutHistory } from "./use-layout-history";

const newId = () => crypto.randomUUID().slice(0, 8);
const inputClass = "h-8 border-transparent bg-muted/60 text-[13px] shadow-none hover:border-border";

/**
 * A unit type's rooms on a canvas, Figma style: rooms on the left, the plan in the middle, the
 * picked room (or the type itself) on the right. Design floor opens it in place by double-clicking
 * a unit; the unit types list opens it in its own window. Saving changes every unit of the type.
 */
export function UnitTypeWorkspace({
  propertyId,
  type,
  copyOf,
  parentLabel,
  canManagePrices,
  onBack,
  onSaved,
}: {
  propertyId: string;
  type: UnitTypeFacts | null;
  /** A type to start a new one from: its rooms, size and price, under a new name. */
  copyOf?: UnitTypeFacts;
  /** Where Back returns to, shown first in the breadcrumb: "1st Floor", "Unit types". */
  parentLabel: string;
  /** Without "Manage prices", the amounts show but can't be changed. */
  canManagePrices: boolean;
  onBack: () => void;
  onSaved: (saved: UnitTypeFacts) => void;
}) {
  const from = type ?? copyOf;
  const [name, setName] = useState(type?.name ?? (copyOf ? `${copyOf.name} copy` : ""));
  const [price, setPrice] = useState(from?.price ? String(Number(from.price)) : "");
  // Blank uses the property's reservation fee and monthly amortization.
  const [reservationFee, setReservationFee] = useState(
    from?.reservationFee ? String(Number(from.reservationFee)) : "",
  );
  const [monthlyAmortization, setMonthlyAmortization] = useState(
    from?.monthlyAmortization ? String(Number(from.monthlyAmortization)) : "",
  );
  // Undo and redo cover rooms and size, like Design floor (Ctrl+Z, Ctrl+Shift+Z).
  const history = useLayoutHistory<UnitDesign>(() => from?.layout ?? defaultUnitDesign);
  const design = history.value;
  const setDesign = history.set;
  // Several rooms can be picked to move, copy or remove together.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const facts = designFacts(design);
  const picked = design.rooms.filter((room) => selectedIds.includes(room.id));
  const selected = picked.length === 1 ? picked[0]! : null;
  const title = name.trim() || (type ? type.name : "New unit type");

  const setRooms = (rooms: UnitRoom[]) => setDesign({ ...design, rooms });
  const changeRoom = (next: UnitRoom) =>
    setRooms(design.rooms.map((room) => (room.id === next.id ? next : room)));
  const addRoom = (kind: RoomKind, at?: { x: number; y: number }) => {
    const [w, h] = roomSizes[kind];
    const spot = at
      ? { x: at.x - w / 2, y: at.y - h / 2 }
      : freeSpot([w, h], design.rooms, design.width, design.depth);
    const room = placeWithin(
      { id: newId(), kind, w, h, rotation: 0 as const, flip: false, ...spot },
      design.width,
      design.depth,
      roomMargin(kind),
    );
    setRooms([...design.rooms, room]);
    setSelectedIds([room.id]);
  };
  // Shrinking the unit pulls its rooms back inside.
  const resize = (key: "width" | "depth", value: number) => {
    const next = { ...design, [key]: value };
    setDesign({
      ...next,
      rooms: next.rooms.map((room) =>
        placeWithin(room, next.width, next.depth, roomMargin(room.kind)),
      ),
    });
  };
  const back = () => {
    if (history.canUndo && !window.confirm(`Leave ${title} without saving?`)) return;
    onBack();
  };
  const save = () =>
    startTransition(async () => {
      const result = await saveUnitType({
        propertyId,
        id: type?.id,
        name,
        price,
        reservationFee,
        monthlyAmortization,
        layout: design,
      });
      if (!result.success) return void notify(result.error.message, "error");
      const { id, repriced } = result.data;
      notify(
        `${type ? "Unit type saved." : "Unit type added."}${
          repriced ? ` ${repriced} ${repriced === 1 ? "unit uses" : "units use"} its price.` : ""
        }`,
        "success",
      );
      onSaved({
        id,
        name: name.trim(),
        bedrooms: facts.bedrooms,
        floorArea: String(facts.floorArea),
        price: price || null,
        reservationFee: reservationFee || null,
        monthlyAmortization: monthlyAmortization || null,
        layout: design,
      });
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside
        aria-label="Rooms"
        className="flex shrink-0 gap-2 overflow-x-auto border-b border-border p-3 [scrollbar-width:none] lg:w-56 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-r lg:border-b-0 lg:[scrollbar-width:auto]"
      >
        <h3 className="hidden text-xs font-semibold text-muted-foreground lg:block">Rooms</h3>
        {roomKinds.map((kind) => {
          const [w, h] = roomSizes[kind];
          return (
            <PaletteItem
              key={kind}
              pieceKey={kind}
              title={roomLabels[kind]}
              detail={`${w} × ${h} m`}
              art={
                <svg viewBox={`-0.1 -0.1 ${w + 0.2} ${h + 0.2}`} className="size-9">
                  <RoomArt kind={kind} w={w} h={h} />
                </svg>
              }
              onAdd={() => addRoom(kind)}
            />
          );
        })}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-4">
        <LayoutCanvas
          toolbar={
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
              <button
                type="button"
                onClick={back}
                className="rounded px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {parentLabel}
              </button>
              <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
              <span className="truncate px-1.5 font-medium">{title}</span>
            </nav>
          }
          width={design.width}
          depth={design.depth}
          items={design.rooms}
          onChange={setRooms}
          history={history}
          render={(room) => (
            <RoomArt
              kind={room.kind}
              w={room.w}
              h={room.h}
              rotation={room.rotation}
              flip={room.flip}
              label
            />
          )}
          resizable={() => true}
          flippable={() => true}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onDropPiece={(key, x, y) =>
            roomKinds.includes(key as RoomKind) && addRoom(key as RoomKind, { x, y })
          }
          ariaLabel={`${title} design`}
          walls
          margin={(room) => roomMargin(room.kind)}
          ignoreClash={(room) => isDoor(room.kind)}
          overhang={OVERHANG}
        />
      </div>

      <aside
        aria-label="Properties"
        className="flex max-h-[42dvh] shrink-0 flex-col overflow-y-auto border-t border-border lg:max-h-none lg:w-64 lg:border-t-0 lg:border-l"
      >
        {picked.length > 0 ? (
          <PanelSection title={selected ? roomLabels[selected.kind] : `${picked.length} selected`}>
            {selected && (
              <GeometryFields
                item={selected}
                width={design.width}
                depth={design.depth}
                margin={roomMargin(selected.kind)}
                onChange={changeRoom}
              />
            )}
            <PieceActions
              item={selected ?? undefined}
              width={design.width}
              depth={design.depth}
              margin={selected ? roomMargin(selected.kind) : 0}
              canFlip
              onChange={changeRoom}
              onDuplicate={() => {
                const copies = copyGroupBeside(picked, design.width, design.depth, newId, (room) =>
                  roomMargin(room.kind),
                );
                setRooms([...design.rooms, ...copies]);
                setSelectedIds(copies.map((copy) => copy.id));
              }}
              onRemove={() => {
                setRooms(design.rooms.filter((room) => !selectedIds.includes(room.id)));
                setSelectedIds([]);
              }}
            />
          </PanelSection>
        ) : (
          <>
            <PanelSection title="Unit type">
              <Input
                aria-label="Unit type name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. 2 BR corner"
                maxLength={60}
                className={inputClass}
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatArea(facts.floorArea)} · {facts.bedrooms} BR
              </p>
            </PanelSection>
            <PanelSection title="Size (m)">
              <div className="grid grid-cols-2 gap-2">
                <MetreField
                  label="W"
                  name="Unit width, in metres"
                  value={design.width}
                  min={2}
                  max={60}
                  onCommit={(value) => resize("width", value)}
                />
                <MetreField
                  label="H"
                  name="Unit depth, in metres"
                  value={design.depth}
                  min={2}
                  max={60}
                  onCommit={(value) => resize("depth", value)}
                />
              </div>
            </PanelSection>
            {/* What a unit of this type costs; the two fees fall back to the property's. */}
            <PanelSection title="Payment">
              {(
                [
                  ["Price", price, setPrice],
                  ["Reservation fee", reservationFee, setReservationFee],
                  ["Monthly amortization", monthlyAmortization, setMonthlyAmortization],
                ] as const
              ).map(([label, value, set]) => (
                <label key={label} className="grid gap-1 text-xs text-muted-foreground">
                  {label}
                  <MoneyInput
                    value={value}
                    onValueChange={set}
                    placeholder="0.00"
                    disabled={!canManagePrices}
                    className={`${inputClass} tabular-nums`}
                  />
                </label>
              ))}
            </PanelSection>
          </>
        )}
        <div className="mt-auto flex gap-2 border-t border-border p-3 lg:border-t-0">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={pending}
            onClick={back}
          >
            Back
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={pending || !name.trim()}
            onClick={save}
          >
            {pending ? "Saving…" : "Save type"}
          </Button>
        </div>
      </aside>
    </div>
  );
}
