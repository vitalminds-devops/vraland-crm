"use client";

import { Fragment, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { notify } from "@/components/ui/toast";
import { saveUnitType } from "../actions/unit-type.actions";
import {
  defaultUnitDesign,
  designFacts,
  formatArea,
  freeSpot,
  OVERHANG,
  placeWithin,
  roomKinds,
  roomMargin,
  isDoor,
  roomLabels,
  roomSizes,
  rotate,
  type RoomKind,
  type UnitDesign,
  type UnitRoom,
  type UnitTypeFacts,
} from "../lib/floor-layout";
import { LayoutCanvas } from "./layout-canvas";
import { useLayoutHistory } from "./use-layout-history";
import { RoomArt } from "./layout-art";
import { PaletteItem, SelectionBar } from "./layout-palette";

const newId = () => crypto.randomUUID().slice(0, 8);

/** Design a unit type by dragging rooms into it; its size and bedrooms follow the design. */
export function UnitDesigner({
  propertyId,
  type,
  copyOf,
  onClose,
}: {
  propertyId: string;
  type: UnitTypeFacts | null;
  /** A type to start a new one from: its rooms, size and price, under a new name. */
  copyOf?: UnitTypeFacts;
  onClose: () => void;
}) {
  const [name, setName] = useState(type?.name ?? (copyOf ? `${copyOf.name} copy` : ""));
  const from = type ?? copyOf;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const facts = designFacts(design);
  const selected = design.rooms.find((room) => room.id === selectedId) ?? null;

  const setRooms = (rooms: UnitRoom[]) => setDesign({ ...design, rooms });
  const addRoom = (kind: RoomKind, at?: { x: number; y: number }) => {
    const [w, h] = roomSizes[kind];
    const spot = at
      ? { x: at.x - w / 2, y: at.y - h / 2 }
      : freeSpot([w, h], design.rooms, design.width, design.depth);
    const room = placeWithin(
      { id: newId(), kind, w, h, rotation: 0 as const, ...spot },
      design.width,
      design.depth,
      roomMargin(kind),
    );
    setRooms([...design.rooms, room]);
    setSelectedId(room.id);
  };
  // Shrinking the unit pulls its rooms back inside.
  const resize = (key: "width" | "depth", text: string) => {
    const value = Math.min(60, Math.max(2, Number(text) || 2));
    const next = { ...design, [key]: value };
    setDesign({
      ...next,
      rooms: next.rooms.map((room) =>
        placeWithin(room, next.width, next.depth, roomMargin(room.kind)),
      ),
    });
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
      const { repriced } = result.data;
      notify(
        `${type ? "Unit type saved." : "Unit type added."}${
          repriced ? ` ${repriced} ${repriced === 1 ? "unit uses" : "units use"} its price.` : ""
        }`,
        "success",
      );
      onClose();
    });

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogPortal>
        {/* Full screen, like Design floor: the plan gets every pixel. */}
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50">
          <DialogPopup className="flex h-dvh w-full flex-col overflow-hidden bg-card">
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <header className="max-h-[45dvh] shrink-0 space-y-4 overflow-y-auto border-b border-border px-4 py-4 sm:px-5">
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  {type ? `Design ${type.name}` : copyOf ? `Copy ${copyOf.name}` : "Design a unit"}
                </DialogTitle>
                <div className="grid items-end gap-4 xl:grid-cols-[minmax(12rem,1fr)_auto_auto] xl:gap-5">
                  <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
                    Name
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="e.g. 2 BR corner"
                      required
                      maxLength={60}
                      className="h-10 shadow-none text-base text-foreground sm:text-sm"
                    />
                  </label>
                  {/* What a unit of this type costs; the two fees fall back to the property's. */}
                  <fieldset className="grid min-w-0 gap-3 sm:grid-cols-3 xl:w-[32rem] xl:border-l xl:border-border/60 xl:pl-5">
                    <legend className="sr-only">Prices</legend>
                    {(
                      [
                        [
                          "Price",
                          price,
                          setPrice,
                          "0.00",
                          "Sets the price of its units still for sale",
                        ],
                        ["Reservation fee", reservationFee, setReservationFee, "0.00"],
                        [
                          "Monthly amortization",
                          monthlyAmortization,
                          setMonthlyAmortization,
                          "0.00",
                        ],
                      ] as const
                    ).map(([label, value, set, placeholder, title]) => (
                      <label
                        key={label}
                        title={title}
                        className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground"
                      >
                        {label}
                        <MoneyInput
                          value={value}
                          onValueChange={set}
                          placeholder={placeholder}
                          className="h-10 shadow-none text-base text-foreground tabular-nums sm:text-sm"
                        />
                      </label>
                    ))}
                  </fieldset>
                  <div className="flex flex-wrap items-end gap-3 xl:border-l xl:border-border/60 xl:pl-5">
                    <fieldset className="grid gap-1 text-xs font-medium text-muted-foreground">
                      <legend className="mb-1.5">Size (m)</legend>
                      <div className="flex h-10 items-center gap-1 rounded-md border border-input bg-muted/30 px-1">
                        {(["width", "depth"] as const).map((key, index) => (
                          <Fragment key={key}>
                            {index > 0 && <span aria-hidden="true">×</span>}
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={2}
                              max={60}
                              step={0.5}
                              aria-label={key === "width" ? "Width in metres" : "Depth in metres"}
                              value={design[key]}
                              onChange={(event) => resize(key, event.target.value)}
                              className="h-8 w-14 rounded-sm border-0 bg-transparent px-1 shadow-none [appearance:textfield] text-center text-base text-foreground tabular-nums sm:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                          </Fragment>
                        ))}
                      </div>
                    </fieldset>
                    <p
                      aria-live="polite"
                      className="flex h-10 flex-col justify-center gap-0.5 text-xs leading-4 text-muted-foreground tabular-nums"
                    >
                      <span className="text-[13px] font-medium text-foreground">
                        {formatArea(facts.floorArea)}
                      </span>
                      <span>{facts.bedrooms} BR</span>
                    </p>
                  </div>
                </div>
              </header>

              <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                <aside
                  aria-label="Rooms"
                  className="flex shrink-0 gap-2 overflow-x-auto border-b border-border p-3 [scrollbar-width:none] lg:[scrollbar-width:auto] lg:w-48 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0"
                >
                  <h3 className="hidden text-[11px] font-semibold tracking-wider text-muted-foreground uppercase lg:block">
                    Rooms
                  </h3>
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
                      <SelectionBar
                        name={selected ? roomLabels[selected.kind] : null}
                        onRotate={() =>
                          selected &&
                          setRooms(
                            design.rooms.map((room) =>
                              room.id === selected.id
                                ? placeWithin(
                                    rotate(room),
                                    design.width,
                                    design.depth,
                                    roomMargin(room.kind),
                                  )
                                : room,
                            ),
                          )
                        }
                        onRemove={() => {
                          setRooms(design.rooms.filter((room) => room.id !== selectedId));
                          setSelectedId(null);
                        }}
                      />
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
                        label
                      />
                    )}
                    resizable={() => true}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onDropPiece={(key, x, y) =>
                      roomKinds.includes(key as RoomKind) && addRoom(key as RoomKind, { x, y })
                    }
                    ariaLabel="Unit design"
                    walls
                    margin={(room) => roomMargin(room.kind)}
                    ignoreClash={(room) => isDoor(room.kind)}
                    overhang={OVERHANG}
                  />
                </div>
              </div>

              <footer className="flex justify-end gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={pending || !name.trim()}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </footer>
            </form>
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
