"use client";

import { Building2, Check } from "lucide-react";
import { useRef, useState } from "react";

import { Paginator } from "@/components/ui/paginator";
import { cn } from "@/lib/utils/cn";
import { InventoryUnitCard } from "./inventory-unit-card";
import { UnitPanoramaViewer } from "./unit-panorama-viewer";

export type InventoryBuildingData = {
  id: string;
  title: string;
  availableUnits: number;
  totalUnits: number;
  floors: {
    id: string;
    label: string;
    availableUnits: number;
    totalUnits: number;
    hasAccess: boolean;
  }[];
};

export type InventoryFloorData = {
  id: string;
  label: string;
  buildingId: string;
  unitCount: number;
};

export type InventoryUnitCardData = {
  id: string;
  code: string;
  status: string;
  floorId: string;
  imageUrl: string | null;
  photoCount: number;
  accessible: boolean;
};

type InventoryBrowserProps = {
  buildings: InventoryBuildingData[];
  units: InventoryUnitCardData[];
  activeFloorId: string | null;
  onActiveFloorChange: (floorId: string | null) => void;
  selectedFloorIds: string[];
  selectedUnitIds: string[];
  excludedUnitIds: string[];
  onToggleUnit: (unitId: string) => void;
  onToggleFloor: (floorId: string) => void;
  onToggleBuilding: (buildingId: string) => void;
  onSetUnitsSelected: (unitIds: string[], selected: boolean) => void;
  disabled?: boolean;
  emptyLabel?: string;
};

type TickState = "none" | "partial" | "all";

function tickBoxClass(state: TickState): string {
  if (state === "all") return "border-primary bg-primary text-primary-foreground";
  if (state === "partial") return "border-primary/50 bg-primary/20 text-primary";
  return "border-border bg-background hover:border-primary/60";
}

/** `mixed` is the accessible name for "some of it", and screen readers say so. */
function tickAria(state: TickState): boolean | "mixed" {
  return state === "all" ? true : state === "partial" ? "mixed" : false;
}

const UNITS_PER_PAGE = 20;

export function InventoryBrowser({
  buildings,
  units,
  activeFloorId,
  onActiveFloorChange,
  selectedFloorIds,
  selectedUnitIds,
  excludedUnitIds,
  onToggleUnit,
  onToggleFloor,
  onToggleBuilding,
  onSetUnitsSelected,
  disabled = false,
  emptyLabel = "No units available.",
}: InventoryBrowserProps) {
  const [previewUnitId, setPreviewUnitId] = useState<string | null>(null);
  const previewUnit = units.find((unit) => unit.id === previewUnitId) ?? null;

  // Group units by floor
  const unitsByFloor = new Map<string, InventoryUnitCardData[]>();
  for (const unit of units) {
    const list = unitsByFloor.get(unit.floorId);
    if (list) list.push(unit);
    else unitsByFloor.set(unit.floorId, [unit]);
  }

  // Get units for the active floor
  const activeUnits = activeFloorId ? (unitsByFloor.get(activeFloorId) ?? []) : [];

  const activeEntry = buildings
    .flatMap((building) => building.floors.map((floor) => ({ building, floor })))
    .find((entry) => entry.floor.id === activeFloorId);
  const activeBuilding = activeEntry?.building ?? buildings[0] ?? null;
  const activeFloor = activeEntry?.floor ?? null;

  const namedUnitIds = new Set(selectedUnitIds);
  const heldBackIds = new Set(excludedUnitIds);
  const grantedFloorIds = new Set(selectedFloorIds);
  const floorOfUnit = new Map(units.map((unit) => [unit.id, unit.floorId] as const));
  const isHeldBack = (unitId: string) => heldBackIds.has(unitId);
  const isGranted = (unitId: string) =>
    !heldBackIds.has(unitId) &&
    (namedUnitIds.has(unitId) || grantedFloorIds.has(floorOfUnit.get(unitId) ?? ""));

  /** Every unit on the floor on screen given: what the bulk control reads. */
  const eligibleActiveUnits = activeUnits.filter(
    (unit) => unit.accessible && (unit.status === "available" || isGranted(unit.id)),
  );
  const everyUnitOnFloorGranted =
    eligibleActiveUnits.length > 0 && eligibleActiveUnits.every((unit) => isGranted(unit.id));
  const givenOnActiveFloor = activeUnits.filter((unit) => isGranted(unit.id)).length;

  const [unitPage, setUnitPage] = useState(0);
  const [pageFloorId, setPageFloorId] = useState(activeFloorId);
  if (pageFloorId !== activeFloorId) {
    setPageFloorId(activeFloorId);
    setUnitPage(0);
  }

  const pageCount = Math.max(1, Math.ceil(activeUnits.length / UNITS_PER_PAGE));
  const currentPage = Math.min(unitPage, pageCount - 1);
  const firstOnPage = currentPage * UNITS_PER_PAGE;
  const pageUnits = activeUnits.slice(firstOnPage, firstOnPage + UNITS_PER_PAGE);

  const unitsPanelRef = useRef<HTMLDivElement>(null);
  const goToPage = (next: number) => {
    setUnitPage(next);
    unitsPanelRef.current?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="flex max-h-[min(34rem,calc(100dvh_-_12rem))] flex-col self-start overflow-hidden rounded-xl border border-border/60 bg-card">
        <h3 className="shrink-0 border-b border-border/40 px-3 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Floors
        </h3>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-3 rounded-[4px] border border-primary bg-primary"
            />
            All of it
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-3 rounded-[4px] border border-primary/50 bg-primary/20"
            />
            Some of it
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
          {buildings.map((building) => {
            const buildingUnits = building.floors
              .flatMap((floor) => unitsByFloor.get(floor.id) ?? [])
              .filter((unit) => unit.accessible !== false);
            const grantedOnBuilding = buildingUnits.filter((unit) => isGranted(unit.id)).length;
            const anyFloorNamed = building.floors.some((floor) =>
              selectedFloorIds.includes(floor.id),
            );
            const everyFloorNamed =
              building.floors.length > 0 &&
              building.floors.every((floor) => selectedFloorIds.includes(floor.id));
            const eligibleBuildingUnits = buildingUnits.filter(
              (unit) => unit.status === "available" || isGranted(unit.id),
            );
            const buildingState: TickState = (
              eligibleBuildingUnits.length
                ? eligibleBuildingUnits.every((unit) => isGranted(unit.id))
                : everyFloorNamed
            )
              ? "all"
              : anyFloorNamed || grantedOnBuilding > 0
                ? "partial"
                : "none";
            const buildingAvailable = Number.isFinite(building.availableUnits)
              ? building.availableUnits
              : building.totalUnits;
            return (
              <div key={building.id} className="space-y-0.5">
                <div className="flex items-center gap-2 rounded-lg px-1 py-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={tickAria(buildingState)}
                    aria-label={`Give access to all of ${building.title}`}
                    title={
                      buildingState === "all"
                        ? `Remove all of ${building.title}`
                        : `Give all of ${building.title}`
                    }
                    disabled={disabled}
                    onClick={() => {
                      if (buildingState === "none") {
                        onToggleBuilding(building.id);
                        return;
                      }
                      if (buildingState === "partial") {
                        onSetUnitsSelected(
                          buildingUnits.map((unit) => unit.id),
                          true,
                        );
                        return;
                      }
                      if (anyFloorNamed) {
                        onToggleBuilding(building.id);
                        return;
                      }
                      onSetUnitsSelected(
                        buildingUnits.map((unit) => unit.id),
                        false,
                      );
                    }}
                    className={cn(
                      "grid size-5 shrink-0 place-content-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      tickBoxClass(buildingState),
                    )}
                  >
                    {buildingState !== "none" && (
                      <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                    )}
                  </button>
                  <Building2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {building.title}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                    {buildingAvailable} of {building.totalUnits}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {building.floors.map((floor) => {
                    const isActive = activeFloorId === floor.id;
                    const floorNamed = selectedFloorIds.includes(floor.id);
                    const floorUnits = (unitsByFloor.get(floor.id) ?? []).filter(
                      (unit) => unit.accessible !== false,
                    );
                    const heldBackOnFloor = floorUnits.filter((unit) => isHeldBack(unit.id)).length;
                    const eligibleFloorUnits = floorUnits.filter(
                      (unit) => unit.status === "available" || isGranted(unit.id),
                    );
                    const everyUnitGranted = eligibleFloorUnits.length
                      ? eligibleFloorUnits.every((unit) => isGranted(unit.id))
                      : floorNamed;
                    const floorState: TickState = everyUnitGranted
                      ? "all"
                      : heldBackOnFloor > 0 || floorUnits.some((unit) => isGranted(unit.id))
                        ? "partial"
                        : "none";
                    const includedCount = floorNamed
                      ? Math.max(0, floor.totalUnits - heldBackOnFloor)
                      : floorUnits.filter((unit) => isGranted(unit.id)).length;
                    return (
                      <li key={floor.id}>
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded-lg py-0.5 pr-2 pl-4 transition-colors",
                            isActive ? "bg-primary/5" : "hover:bg-muted/60",
                          )}
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={tickAria(floorState)}
                            aria-label={
                              floor.hasAccess === false
                                ? `${floor.label} is not yours to share`
                                : `Give access to ${floor.label}`
                            }
                            title={
                              floor.hasAccess === false
                                ? "Not yours to share"
                                : floorState === "all"
                                  ? `Remove ${floor.label}`
                                  : `Give every unit on ${floor.label}`
                            }
                            disabled={disabled || floor.hasAccess === false}
                            onClick={() => {
                              if (floorState === "none") {
                                onToggleFloor(floor.id);
                                return;
                              }
                              if (floorState === "partial") {
                                onSetUnitsSelected(
                                  floorUnits.map((unit) => unit.id),
                                  true,
                                );
                                return;
                              }
                              if (floorNamed) {
                                onToggleFloor(floor.id);
                                return;
                              }
                              onSetUnitsSelected(
                                floorUnits.map((unit) => unit.id),
                                false,
                              );
                            }}
                            className={cn(
                              "grid size-5 shrink-0 place-content-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                              tickBoxClass(floorState),
                            )}
                          >
                            {floorState !== "none" && (
                              <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onActiveFloorChange(floor.id)}
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm",
                              isActive ? "font-medium text-primary" : "text-foreground",
                              floor.hasAccess === false ? "opacity-60" : undefined,
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate">{floor.label}</span>
                            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                              {includedCount > 0
                                ? `${includedCount} of ${floor.totalUnits}`
                                : floor.totalUnits}
                            </span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div
        ref={unitsPanelRef}
        className="flex min-w-0 max-h-[min(34rem,calc(100dvh_-_12rem))] scroll-mt-20 flex-col rounded-xl border border-border/60 bg-card"
      >
        {activeFloor && activeBuilding ? (
          <>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
              <h3 className="text-[13px] font-semibold tracking-[-0.01em]">
                <span className="text-muted-foreground">{activeBuilding.title} / </span>
                {activeFloor.label}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-[12px] tabular-nums text-muted-foreground">
                  {givenOnActiveFloor} of {activeUnits.length} given
                </span>
                <button
                  type="button"
                  disabled={disabled || activeUnits.length === 0}
                  onClick={() =>
                    onSetUnitsSelected(
                      activeUnits.map((unit) => unit.id),
                      !everyUnitOnFloorGranted,
                    )
                  }
                  className="text-[12px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {everyUnitOnFloorGranted ? "Hold all back" : "Include all"}
                </button>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-3 rounded-[4px] border border-primary bg-primary"
                />
                Given
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-3 rounded-[4px] border border-destructive/60 bg-destructive/20"
                />
                Held back
              </span>
            </div>

            <ul className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto overscroll-contain p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {pageUnits.map((unit) => {
                const granted = isGranted(unit.id);
                return (
                  <li key={unit.id}>
                    <InventoryUnitCard
                      code={unit.code}
                      status={unit.status}
                      imageUrl={unit.imageUrl}
                      selected={granted}
                      heldBack={isHeldBack(unit.id)}
                      disabled={disabled || !unit.accessible}
                      onToggle={() => onToggleUnit(unit.id)}
                      selectionLabel={
                        !unit.accessible
                          ? `${unit.code} is not yours to share`
                          : `${granted ? "Hold back" : "Give"} ${unit.code}`
                      }
                      onPreview={unit.imageUrl ? () => setPreviewUnitId(unit.id) : undefined}
                      unavailableLabel={!unit.accessible ? "Not yours to share" : undefined}
                    />
                  </li>
                );
              })}
              {!activeUnits.length && (
                <li className="col-span-full text-[13px] text-muted-foreground">{emptyLabel}</li>
              )}
            </ul>

            <Paginator
              page={currentPage}
              pageCount={pageCount}
              onPageChange={goToPage}
              total={activeUnits.length}
              perPage={UNITS_PER_PAGE}
              noun="units"
              disabled={disabled}
            />
          </>
        ) : (
          <p className="grid flex-1 place-content-center p-4 text-center text-[13px] text-muted-foreground">
            {emptyLabel}
          </p>
        )}
      </div>

      {/* Out of flow, so being a child of the grid costs nothing. */}
      {previewUnit?.imageUrl && (
        <UnitPanoramaViewer
          imageUrl={previewUnit.imageUrl}
          unitCode={previewUnit.code}
          onClose={() => setPreviewUnitId(null)}
        />
      )}
    </div>
  );
}
