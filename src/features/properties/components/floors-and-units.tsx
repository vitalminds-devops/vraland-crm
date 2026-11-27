"use client";

import { Building2, LayoutGrid, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Button, ButtonLink } from "@/components/ui/button";
import { FloorMenu } from "./floor-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { cn } from "@/lib/utils/cn";
import { success } from "@/lib/types/action-result";
import { unitImageUrl } from "../lib/floor-image";
import { unitStatusLabel, unitStatuses } from "../lib/unit-codes";
import { AddFloorButton, RemoveFloorButton, RenameFloorButton } from "./unit-controls";
import { UnitViewDialog } from "./unit-view-dialog";
import { surroundingsFor } from "../lib/surroundings";
import { compareParkingCodes } from "../lib/parking-codes";
import type { ParkingSlot } from "./parking-slots";
import type { ParkingType } from "../lib/parking-types";
import { BulkRemoveDialog } from "./bulk-remove-dialog";
import { useRemoveSeveral } from "../lib/remove-several";
import { ParkingSlotDialog } from "./parking-slot-dialog";
import { deleteParkingSlots, deleteUnits } from "../actions/bulk-remove.actions";
import type { ParkingLayout } from "../lib/parking-layout";
import { FloorLayoutView } from "./floor-layout-view";
import { FloorDesigner } from "./floor-designer";
import { formatMoney, formatMoneyShort } from "@/lib/utils/money";
import {
  unitFacts,
  type FloorLayout,
  type UnitDesign,
  type UnitTypeFacts,
  fitPlacements,
} from "../lib/floor-layout";
import { legacyIdentifier, type UnitIdentifier } from "../lib/unit-identifier";

import { UnitPanoramaViewer } from "./unit-panorama-viewer";
import { UnitPictureDialog } from "./unit-picture-dialog";
import { sectionsOfFloor, type Section, type UnitGroup } from "../lib/sections";

/** The same colours as the status dots on the 3D unit tags. */
const statusDot: Record<string, string> = {
  available: "bg-emerald-600",
  deposit_paid: "bg-amber-500",
  sold: "bg-rose-600",
  inactive: "bg-slate-400",
};

const DesignedFloorScene = dynamic(() => import("./designed-floor-scene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">
      Loading floor plan…
    </div>
  ),
});

export function FloorsAndUnits({
  propertyId,
  canManageUnits = false,
  canManagePrices = false,
  billedPrices = {},
  canManageUnitPictures = false,
  floors,
  units,
  unitTypes = [],
  numbering = null,
  propertyType = null,
  currency = "PHP",
  canDesign = false,
  immersive = false,
  overlayInfo,
  overlayActions,
  parkingSlots = [],
  parkingTypes = [],
  sections = [],
}: {
  propertyId: string;
  canManageUnits?: boolean;
  /** Prices and fees: without it, they show but can't be changed. */
  canManagePrices?: boolean;
  /** Prices each unit is billed at on open opportunities, for those who can see Billing. */
  billedPrices?: Record<string, string[]>;
  canManageUnitPictures?: boolean;
  floors: {
    id: string;
    level: number;
    label: string;
    imageStorageKey: string | null;
    layout?: FloorLayout | null;
    /** Parking from the old separate parking designer, carried into the floor design. */
    parkingLayout?: ParkingLayout | null;
    /** Units the caller may see on this floor. */
    unitCount: number;
  }[];
  units: {
    id: string;
    code: string;
    status: string;
    floorId: string;
    imageStorageKey: string | null;
    unitTypeId?: string | null;
    floorArea?: string | null;
    price?: string | null;
    group?: UnitGroup | null;
  }[];
  unitTypes?: UnitTypeFacts[];
  /** How the property numbers its units; designed floors number new units with it. */
  numbering?: UnitIdentifier | null;
  /** Sets what the 3D view draws around the building. */
  propertyType?: string | null;
  /** The property's currency, for each unit's price tag. */
  currency?: string;
  /** Show Design floor; designing lives on the property's Design page. */
  canDesign?: boolean;
  /** Just the floor view, filling the page, with its controls floating over it; no floor list. */
  immersive?: boolean;
  /** Immersive only: a line under the floor's name, such as the property's address. */
  overlayInfo?: ReactNode;
  /** Immersive only: buttons floating over the view's top-right corner. */
  overlayActions?: ReactNode;
  /** The property's parking slots, drawn on floors whose design places them. */
  parkingSlots?: ParkingSlot[];
  /** Design only: the property's parking types for Design floor's palette. */
  parkingTypes?: ParkingType[];
  /** The property's sections, named on each floor in the floor menu. */
  sections?: Section[];
}) {
  const [activeFloorId, setActiveFloorId] = useState<string | null>(floors[0]?.id ?? null);
  const [, startFloorSwitch] = useTransition();
  const removeOpen = useRemoveSeveral((state) => state.open);
  const setRemoveOpen = useRemoveSeveral((state) => state.setOpen);
  const [floorListCollapsed, setFloorListCollapsed] = useState(false);
  const [pictureUnitId, setPictureUnitId] = useState<string | null>(null);
  const [previewUnitId, setPreviewUnitId] = useState<string | null>(null);
  // Designed floors show in 3D; devices that can't draw it get the flat plan.
  const [planFailed, setPlanFailed] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const byFloor = new Map<string, typeof units>();
  for (const unit of units) {
    const list = byFloor.get(unit.floorId);
    if (list) list.push(unit);
    else byFloor.set(unit.floorId, [unit]);
  }
  const activeFloor = floors.find((floor) => floor.id === activeFloorId) ?? floors[0] ?? null;
  const activeUnits = activeFloor ? (byFloor.get(activeFloor.id) ?? []) : [];
  // Nothing is picked until a unit is clicked, so a floor opens without an outline or tag.
  const selectedUnit = activeUnits.find((unit) => unit.id === selectedUnitId) ?? null;
  const typesById = new Map(unitTypes.map((type) => [type.id, type]));
  const factsOf = (unit: (typeof units)[number]) =>
    unitFacts(
      {
        unitTypeId: unit.unitTypeId ?? null,
        floorArea: unit.floorArea ?? null,
        price: unit.price ?? null,
      },
      typesById,
    );
  const [designing, setDesigning] = useState(false);
  const designs = new Map(
    unitTypes.flatMap((type): [string, UnitDesign][] =>
      type.layout ? [[type.id, type.layout]] : [],
    ),
  );
  const activeLayout = activeFloor?.layout
    ? fitPlacements(activeFloor.layout, designs, parkingTypes)
    : null;
  const floorSlots = parkingSlots.filter((slot) => slot.floorId === activeFloor?.id);
  const selectedSlot = floorSlots.find((slot) => slot.id === selectedSlotId) ?? null;
  const selectedSpot = activeLayout?.parking?.find((spot) => spot.slotId === selectedSlot?.id);
  const planReady = Boolean(
    activeLayout &&
    (activeLayout.units.length || activeLayout.spaces.length || activeLayout.parking?.length),
  );
  const hasScene = planReady && !planFailed;
  const selectedFacts = selectedUnit ? factsOf(selectedUnit) : null;
  const pictureUnit = units.find((unit) => unit.id === pictureUnitId) ?? null;
  const previewUnit = units.find((unit) => unit.id === previewUnitId) ?? null;

  // A floor's units and parking are removed together; each kind goes to its own action.
  const removeFromFloor = async (ids: string[]) => {
    const unitIds = ids.filter((id) => activeUnits.some((unit) => unit.id === id));
    const slotIds = ids.filter((id) => !unitIds.includes(id));
    let removed = 0;
    for (const [list, action] of [
      [unitIds, deleteUnits],
      [slotIds, deleteParkingSlots],
    ] as const) {
      if (!list.length) continue;
      const result = await action({ propertyId, ids: list });
      if (!result.success) return result;
      removed += result.data.removed;
    }
    return success({ removed });
  };

  // A picked unit opens large in a modal: its design, details and actions.
  const selectedPanel = selectedUnit && activeFloor && (
    <UnitViewDialog
      key={selectedUnit.id}
      unit={selectedUnit}
      floorLabel={activeFloor.label}
      facts={selectedFacts!}
      design={selectedUnit.unitTypeId ? (designs.get(selectedUnit.unitTypeId) ?? null) : null}
      // A unit's fees are its unit type's.
      reservationFee={formatMoney(
        typesById.get(selectedUnit.unitTypeId ?? "")?.reservationFee,
        currency,
      )}
      monthlyAmortization={formatMoney(
        typesById.get(selectedUnit.unitTypeId ?? "")?.monthlyAmortization,
        currency,
      )}
      imageUrl={unitImageUrl(selectedUnit)}
      unitTypes={unitTypes}
      billedPrices={billedPrices[selectedUnit.id] ?? []}
      canManageUnits={canManageUnits}
      canManagePrices={canManagePrices}
      canManageUnitPictures={canManageUnitPictures}
      // The photo views open on their own, in place of this modal.
      onPreviewPhoto={() => {
        setSelectedUnitId(null);
        setPreviewUnitId(selectedUnit.id);
      }}
      onEditPhoto={() => {
        setSelectedUnitId(null);
        setPictureUnitId(selectedUnit.id);
      }}
      onClose={() => setSelectedUnitId(null)}
    />
  );

  if (!floors.length) {
    return (
      // Centred in the space the floor view would fill, so a property with no floors isn't blank.
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
        <Building2 aria-hidden="true" className="size-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No floors yet.</p>
        {canManageUnits && (
          <ButtonLink href={`/design/${propertyId}?tab=floors`} className="gap-2">
            <Building2 aria-hidden="true" className="size-4" />
            Design property
          </ButtonLink>
        )}
      </div>
    );
  }

  const workspace = (
    <div
      className={cn(
        "grid min-h-0 grid-rows-[auto_minmax(0,1fr)] lg:grid-rows-1",
        immersive
          ? "grid-rows-1 lg:grid-cols-1"
          : floorListCollapsed
            ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]"
            : "lg:grid-cols-[13rem_minmax(0,1fr)]",
        immersive ? "h-full" : "h-[clamp(28rem,72dvh,48rem)] lg:h-[max(32rem,calc(100dvh-10rem))]",
      )}
    >
      {!immersive && (
        <div className="flex min-w-0 flex-col border-b border-border/60 bg-muted/20 lg:border-r lg:border-b-0">
          <div
            className={cn(
              "hidden shrink-0 items-center border-b border-border/40 p-2 lg:flex",
              floorListCollapsed ? "justify-center" : "justify-between",
            )}
          >
            {!floorListCollapsed && (
              <span className="px-2 text-[12px] font-medium text-muted-foreground">Floors</span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label={floorListCollapsed ? "Expand floor list" : "Minimize floor list"}
              aria-expanded={!floorListCollapsed}
              title={floorListCollapsed ? "Expand floor list" : "Minimize floor list"}
              onClick={() => setFloorListCollapsed(!floorListCollapsed)}
            >
              {floorListCollapsed ? (
                <PanelLeftOpen aria-hidden="true" className="size-4" />
              ) : (
                <PanelLeftClose aria-hidden="true" className="size-4" />
              )}
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-2">
            {/* Absolute on lg so the list fills the panel's height without stretching the row. */}
            <div className="lg:relative lg:min-h-[16rem] lg:flex-1">
              <ul className="flex gap-1 overflow-x-auto lg:absolute lg:inset-0 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pr-1">
                {floors.map((floor) => {
                  const onFloor = byFloor.get(floor.id) ?? [];
                  const isActive = activeFloor?.id === floor.id;
                  return (
                    <li
                      key={floor.id}
                      className="group relative flex shrink-0 items-center gap-1 lg:block"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              // A transition keeps the list responsive while the new floor builds.
                              startFloorSwitch(() => setActiveFloorId(floor.id));
                            }}
                            aria-current={isActive ? "true" : undefined}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:w-full",
                              floorListCollapsed && "lg:justify-center lg:px-1",
                              isActive
                                ? "bg-primary font-medium text-primary-foreground shadow-xs"
                                : "text-foreground hover:bg-muted/60",
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "grid size-7 shrink-0 place-items-center rounded-md border text-[12px] font-semibold tabular-nums",
                                isActive
                                  ? "border-white/30 bg-white/10"
                                  : "border-border bg-card text-muted-foreground",
                              )}
                            >
                              {floor.level}
                            </span>
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate",
                                floorListCollapsed && "lg:sr-only",
                              )}
                            >
                              {floor.label}
                            </span>
                            <span
                              className={cn(
                                "min-w-6 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] tabular-nums",
                                floorListCollapsed && "lg:hidden",
                                isActive
                                  ? "bg-white/15 text-primary-foreground"
                                  : "bg-muted text-muted-foreground",
                                // The rename and remove buttons take this spot on hover.
                                canManageUnits &&
                                  "lg:group-focus-within:invisible lg:group-hover:invisible",
                              )}
                            >
                              {/* Only what the viewer can see; units not shared with them stay unmentioned. */}
                              {onFloor.length}
                            </span>
                          </button>
                        </TooltipTrigger>
                        {floorListCollapsed && (
                          <TooltipContent side="right" className="max-lg:hidden">
                            {floor.label}
                          </TooltipContent>
                        )}
                      </Tooltip>
                      {canManageUnits && (
                        <span
                          className={cn(
                            "flex shrink-0 items-center gap-1 lg:absolute lg:top-1/2 lg:right-2 lg:-translate-y-1/2 lg:opacity-0 lg:transition-opacity lg:group-focus-within:opacity-100 lg:group-hover:opacity-100",
                            floorListCollapsed && "lg:hidden",
                          )}
                        >
                          <RenameFloorButton floorId={floor.id} label={floor.label} />
                          <RemoveFloorButton
                            floorId={floor.id}
                            label={floor.label}
                            unitCount={floor.unitCount}
                            overlay
                          />
                        </span>
                      )}
                    </li>
                  );
                })}
                {/* Adding sits at the end of the list it adds to, not in a header of its own. */}
                {canManageUnits && (
                  <li className="shrink-0">
                    <AddFloorButton
                      propertyId={propertyId}
                      className={cn(
                        "h-11 w-full justify-start gap-2 px-2 text-sm font-medium text-primary hover:bg-primary/10 hover:text-primary",
                        floorListCollapsed && "lg:justify-center lg:px-0 lg:[&>span]:sr-only",
                      )}
                    />
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeFloor && (
        <div className={cn("flex min-h-0 min-w-0 flex-col", immersive && "relative")}>
          {/* Immersive, the actions float over the view's top-right corner. */}
          {immersive && overlayActions && (
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2 [&_a]:shadow-sm [&_button]:shadow-sm">
              {overlayActions}
            </div>
          )}
          {immersive && overlayInfo && (
            <div
              className={cn(
                "absolute top-3 left-3 z-10 min-w-0 max-w-[calc(100%-24rem)] rounded-md px-3 py-2 max-lg:top-16 max-lg:max-w-[calc(100%-1.5rem)]",
                hasScene
                  ? "bg-black/60 font-medium text-white [&_.text-muted-foreground]:text-white [&_a]:text-white [&_a]:underline [&_a]:focus-visible:ring-white/60"
                  : "text-muted-foreground [&_a]:font-medium [&_a]:text-primary",
              )}
            >
              {overlayInfo}
            </div>
          )}
          {/* Translucent backing keeps road markings from competing with the overlay text. */}
          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1",
              immersive
                ? cn(
                    "absolute bottom-3 left-3 z-10 max-w-[calc(100%-24rem)] rounded-md px-3 py-2 max-lg:bottom-20 max-lg:max-w-[calc(100%-1.5rem)]",
                    hasScene ? "bg-black/60 text-white" : "text-foreground",
                  )
                : "border-b border-border/60 px-4 py-2",
            )}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{activeFloor.label}</h3>
              <p
                className={cn(
                  "text-[12px] tabular-nums",
                  immersive && hasScene
                    ? "text-[13px] font-medium text-white"
                    : "text-muted-foreground",
                )}
              >
                {activeUnits.length} {activeUnits.length === 1 ? "unit" : "units"}
                {floorSlots.length > 0 &&
                  ` · ${floorSlots.length} parking ${floorSlots.length === 1 ? "slot" : "slots"}`}
              </p>
              {/* Sales figures belong on the property page; the Design page only designs. */}
              {!canDesign && activeUnits.length > 0 && (
                <ul
                  aria-label="Unit status on this floor"
                  className={cn(
                    "flex flex-wrap gap-x-3 gap-y-1 text-[12px]",
                    immersive && hasScene
                      ? "text-[13px] font-medium text-white"
                      : "text-muted-foreground",
                  )}
                >
                  {unitStatuses.map((status) => {
                    const count = activeUnits.filter((unit) => unit.status === status).length;
                    if (!count) return null;
                    return (
                      <li key={status} className="flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-2 rounded-full",
                            immersive && hasScene && "size-2.5 ring-1 ring-white/30",
                            statusDot[status],
                          )}
                        />
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            immersive && hasScene ? "text-white" : "text-foreground",
                          )}
                        >
                          {count}
                        </span>
                        {unitStatusLabel(status)}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManageUnits && !canDesign && (
                <BulkRemoveDialog
                  // On the property page it opens from the Actions menu instead of its own button.
                  {...(immersive ? { open: removeOpen, onOpenChange: setRemoveOpen } : {})}
                  noun={floorSlots.length ? ["unit or slot", "units and slots"] : ["unit", "units"]}
                  place={activeFloor.label}
                  items={[
                    ...activeUnits.map((unit) => ({
                      ...unit,
                      code: `Unit ${unit.code}`,
                      group: "Units",
                    })),
                    ...floorSlots.map((slot) => ({
                      ...slot,
                      code: `Parking ${slot.code}`,
                      group: "Parking",
                    })),
                  ]}
                  onRemove={(ids) => removeFromFloor(ids)}
                />
              )}
              {canDesign && (
                <Button type="button" className="gap-2" onClick={() => setDesigning(true)}>
                  <LayoutGrid aria-hidden="true" className="size-4" />
                  Design floor
                </Button>
              )}
            </div>
          </div>

          {hasScene && activeLayout && (
            <div className="min-h-0 flex-1 overflow-hidden bg-white">
              {/* No key: the 3D canvas stays alive between floors; only its contents change. */}
              <DesignedFloorScene
                floorKey={activeFloor.id}
                floors={floors.map((floor) => ({
                  ...floor,
                  sections: sectionsOfFloor(sections, floor.id),
                }))}
                onFloorChange={(id) => startFloorSwitch(() => setActiveFloorId(id))}
                alwaysShowFloorSwitch={immersive}
                canRenameFloors={canManageUnits && !canDesign}
                propertyId={propertyId}
                layout={activeLayout}
                units={activeUnits.map((unit) => ({
                  ...unit,
                  price: canDesign ? null : formatMoneyShort(factsOf(unit).price, currency),
                }))}
                designs={designs}
                selectedUnitId={canDesign || selectedSlot ? null : selectedUnitId}
                onSelect={
                  canDesign
                    ? undefined
                    : (id) => {
                        setSelectedSlotId(null);
                        setSelectedUnitId(id);
                      }
                }
                selectedSlotId={canDesign ? null : (selectedSlot?.id ?? null)}
                onSelectSlot={canDesign ? undefined : setSelectedSlotId}
                onFallback={() => setPlanFailed(true)}
                surroundings={surroundingsFor(propertyType)}
                parking={floorSlots}
              >
                {null}
              </DesignedFloorScene>
            </div>
          )}

          {/* Devices without 3D get the flat drawing of the same design. */}
          {planReady && activeLayout && planFailed && (
            <div className="mt-4 min-h-0 flex-1 overflow-auto">
              <FloorLayoutView
                key={activeFloor.id}
                layout={activeLayout}
                label={activeFloor.label}
                designs={designs}
                units={activeUnits.map((unit) => ({
                  id: unit.id,
                  code: unit.code,
                  status: unit.status,
                  ...factsOf(unit),
                }))}
                selectedUnitId={selectedUnit?.id ?? null}
                onSelect={setSelectedUnitId}
              ></FloorLayoutView>
            </div>
          )}

          {!planReady && (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col items-center justify-center bg-muted/15 px-6 text-center",
                immersive ? "py-20" : "py-10",
              )}
            >
              <div className="w-full max-w-sm space-y-4">
                <LayoutGrid
                  aria-hidden="true"
                  className="mx-auto size-8 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <div className="space-y-2">
                  <h4 className="text-base leading-6 font-semibold text-foreground">
                    {canManageUnits ? "This floor isn't designed yet." : "No floor plan yet."}
                  </h4>
                  {(canManageUnits || canDesign || floors.length > 1) && (
                    <p className="text-[13px] leading-6 text-muted-foreground">
                      {canManageUnits || canDesign
                        ? "Design this floor to display its layout."
                        : "Choose another floor to view its layout."}
                    </p>
                  )}
                </div>
                {/* With no floor list beside it, an undesigned floor still lets you pick another. */}
                {immersive && floors.length > 1 && (
                  <div className="absolute right-3 bottom-3 z-10 max-w-[calc(100%-1.5rem)] rounded-lg border border-border/60 bg-card p-1 shadow-sm">
                    <FloorMenu
                      propertyId={propertyId}
                      floors={floors}
                      current={activeFloor.id}
                      onPick={(id) => startFloorSwitch(() => setActiveFloorId(id))}
                      canManage={canManageUnits && !canDesign}
                    />
                  </div>
                )}
                {canDesign ? (
                  <Button type="button" className="gap-2" onClick={() => setDesigning(true)}>
                    <LayoutGrid aria-hidden="true" className="size-4" />
                    Design floor
                  </Button>
                ) : (
                  canManageUnits && (
                    <ButtonLink
                      href={`/design/${propertyId}?tab=floors`}
                      variant="primary"
                      className="gap-2"
                    >
                      <LayoutGrid aria-hidden="true" className="size-4" />
                      Design property
                    </ButtonLink>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("space-y-4", immersive && "h-full min-h-0")}>
        {workspace}

        {designing && activeFloor && (
          <FloorDesigner
            key={activeFloor.id}
            floor={{
              id: activeFloor.id,
              level: activeFloor.level,
              label: activeFloor.label,
              layout: activeLayout,
              parkingLayout: activeFloor.parkingLayout ?? null,
            }}
            floorSlots={floorSlots
              .map((slot) => ({ id: slot.id, code: slot.code }))
              .sort((a, b) => compareParkingCodes(a.code, b.code))}
            parkingTypes={parkingTypes}
            propertyId={propertyId}
            otherSlotCodes={parkingSlots
              .filter((slot) => slot.floorId !== activeFloor.id)
              .map((slot) => slot.code)}
            otherFloors={floors
              .filter((floor) => floor.id !== activeFloor.id)
              .map((floor) => ({
                id: floor.id,
                label: floor.label,
                hasLayout: Boolean(floor.layout),
              }))}
            floorUnits={activeUnits.map((unit) => ({ id: unit.id, code: unit.code }))}
            unitTypes={unitTypes}
            numbering={numbering ?? legacyIdentifier}
            canManagePrices={canManagePrices}
            onClose={() => setDesigning(false)}
          />
        )}

        {selectedPanel}
        {!canDesign && selectedSlot && activeFloor && (
          <ParkingSlotDialog
            key={selectedSlot.id}
            slot={selectedSlot}
            size={selectedSpot ?? { w: 2.5, h: 5 }}
            floorLabel={activeFloor.label}
            currency={currency}
            canManage={canManageUnits}
            canManagePrices={canManagePrices}
            onClose={() => setSelectedSlotId(null)}
          />
        )}

        {previewUnit && (
          <UnitPanoramaViewer
            imageUrl={unitImageUrl(previewUnit)}
            unitCode={previewUnit.code}
            onClose={() => setPreviewUnitId(null)}
          />
        )}

        {pictureUnit && (
          <UnitPictureDialog
            unitId={pictureUnit.id}
            code={pictureUnit.code}
            imageUrl={unitImageUrl(pictureUnit)}
            onClose={() => setPictureUnitId(null)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
