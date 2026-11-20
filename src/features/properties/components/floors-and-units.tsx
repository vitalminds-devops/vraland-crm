"use client";

import { Eye, ImagePlus } from "lucide-react";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils/cn";
import { unitImageUrl } from "../lib/floor-image";
import { unitStatusLabel, unitStatusToneFor } from "../lib/unit-codes";
import {
  AddFloorButton,
  AddUnitButton,
  RemoveFloorButton,
  RemoveUnitButton,
  RenameFloorButton,
  RenameUnitButton,
  UnitStatusControl,
} from "./unit-controls";
import { AccessTower } from "./access-tower";
import { UnitStatusLegend } from "./unit-grid";
import { InventoryUnitCard } from "./inventory-unit-card";

import { UnitPanoramaViewer } from "./unit-panorama-viewer";
import { UnitPictureDialog } from "./unit-picture-dialog";

const UnitFloorScene = dynamic(() => import("./unit-floor-scene"), {
  ssr: false,
  loading: () => (
    <div
      style={{ height: "clamp(480px, 48vw, 680px)" }}
      className="grid place-items-center text-sm text-muted-foreground"
    >
      Loading 3D floor…
    </div>
  ),
});

export function FloorsAndUnits({
  propertyId,
  propertyTitle,
  canManageUnits = false,
  canManageUnitPictures = false,
  floors,
  units,
}: {
  propertyId: string;
  /** The property's name, shown as the building above its floors. */
  propertyTitle?: string;
  canManageUnits?: boolean;
  canManageUnitPictures?: boolean;
  floors: {
    id: string;
    level: number;
    label: string;
    imageStorageKey: string | null;
    /** Units the caller may see on this floor. */
    unitCount: number;
  }[];
  units: {
    id: string;
    code: string;
    status: string;
    floorId: string;
    imageStorageKey: string | null;
  }[];
}) {
  const [activeFloorId, setActiveFloorId] = useState<string | null>(floors[0]?.id ?? null);
  const [pictureUnitId, setPictureUnitId] = useState<string | null>(null);
  const [previewUnitId, setPreviewUnitId] = useState<string | null>(null);
  const [view, setView] = useState<"3d" | "top" | "photos">("photos");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const byFloor = new Map<string, typeof units>();
  for (const unit of units) {
    const list = byFloor.get(unit.floorId);
    if (list) list.push(unit);
    else byFloor.set(unit.floorId, [unit]);
  }
  const available = units.filter((unit) => unit.status === "available").length;
  const activeFloor = floors.find((floor) => floor.id === activeFloorId) ?? floors[0] ?? null;
  const activeUnits = activeFloor ? (byFloor.get(activeFloor.id) ?? []) : [];
  const sceneUnits = activeUnits;
  const selectedUnit = activeUnits.find((unit) => unit.id === selectedUnitId) ?? sceneUnits[0];
  const pictureUnit = units.find((unit) => unit.id === pictureUnitId) ?? null;
  const previewUnit = units.find((unit) => unit.id === previewUnitId) ?? null;

  if (!floors.length) {
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-muted-foreground">No floors to display.</p>
        {canManageUnits && (
          <div className="flex flex-wrap items-center gap-2">
            <AddFloorButton propertyId={propertyId} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {floors.length} {floors.length === 1 ? "floor" : "floors"} · {units.length}{" "}
          {units.length === 1 ? "unit" : "units"} · {available} available
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-muted/20">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 py-2 pr-2 pl-4">
            <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Floors
            </h3>
            {canManageUnits && <AddFloorButton propertyId={propertyId} />}
          </div>
          <div className="flex flex-1 flex-col p-2">
            <AccessTower
              title={propertyTitle ?? "This property"}
              floors={floors}
              units={units}
              isGranted={() => true}
              activeFloorId={activeFloor?.id ?? null}
              mini
              className="mb-2 h-auto shrink-0"
            />
            {/* Absolute on lg so the list fills the panel's height without stretching the row. */}
            <div className="lg:relative lg:min-h-[16rem] lg:flex-1">
              <ul className="flex gap-1 overflow-x-auto lg:absolute lg:inset-0 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pr-1">
                {floors.map((floor) => {
                  const onFloor = byFloor.get(floor.id) ?? [];
                  const isActive = activeFloor?.id === floor.id;
                  return (
                    <li key={floor.id} className="group relative shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFloorId(floor.id);
                        }}
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:w-full",
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
                        <span className="min-w-0 flex-1 truncate">{floor.label}</span>
                        <span
                          className={cn(
                            "min-w-6 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] tabular-nums",
                            isActive
                              ? "bg-white/15 text-primary-foreground"
                              : "bg-muted text-muted-foreground",
                            // The rename and remove buttons take this spot on hover.
                            canManageUnits && "group-focus-within:invisible group-hover:invisible",
                          )}
                        >
                          {/* Only what the viewer can see; units not shared with them stay unmentioned. */}
                          {onFloor.length}
                        </span>
                      </button>
                      {canManageUnits && (
                        <span className="absolute top-1/2 right-2 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
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
              </ul>
            </div>
          </div>
        </div>

        {activeFloor && (
          <div className="min-w-0 self-start rounded-xl border border-border/60 bg-muted/15 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em]">
                  {activeFloor.label}
                </h3>
                <span className="text-[12px] tabular-nums text-muted-foreground">
                  {activeUnits.length} {activeUnits.length === 1 ? "unit" : "units"}
                </span>
              </div>
              {canManageUnits && (
                <div className="flex flex-wrap items-center gap-2">
                  <AddUnitButton floorId={activeFloor.id} />
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
              <UnitStatusLegend />
              <div
                className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1"
                aria-label="Floor view"
              >
                {(
                  [
                    ["photos", "List"],
                    ["3d", "3D Floor"],
                    ["top", "Top View"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={view === value ? "primary" : "ghost"}
                    size="sm"
                    aria-pressed={view === value}
                    onClick={() => setView(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {view !== "photos" && sceneUnits.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="overflow-x-auto rounded-xl border border-border/60 bg-white">
                  <UnitFloorScene
                    key={activeFloor.id}
                    units={sceneUnits}
                    unitCount={sceneUnits.length}
                    arrangement="auto"
                    furnished
                    selectedUnitId={selectedUnit?.id ?? null}
                    onSelect={setSelectedUnitId}
                    topView={view === "top"}
                    onFallback={() => setView("photos")}
                  >
                    {selectedUnit && (
                      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-md">
                        <div className="px-3 pt-3 pr-10">
                          <h4 className="text-sm font-semibold">Unit {selectedUnit.code}</h4>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {activeFloor.label}
                          </p>
                        </div>
                        <div className="space-y-3 p-3">
                          {canManageUnits ? (
                            <div className="space-y-1 text-xs text-muted-foreground [&_select]:h-9 [&_select]:border-border [&_select]:bg-background [&_select]:text-foreground">
                              Status
                              <UnitStatusControl
                                unitId={selectedUnit.id}
                                status={selectedUnit.status}
                              />
                            </div>
                          ) : (
                            <span
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-xs font-medium",
                                unitStatusToneFor(selectedUnit.status),
                              )}
                            >
                              {unitStatusLabel(selectedUnit.status)}
                            </span>
                          )}
                          {(unitImageUrl(selectedUnit) || canManageUnitPictures) && (
                            <div className="grid grid-cols-2 gap-2">
                              {unitImageUrl(selectedUnit) && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="w-full gap-1.5 px-2 shadow-none"
                                  aria-label={`Preview ${selectedUnit.code} photo`}
                                  onClick={() => setPreviewUnitId(selectedUnit.id)}
                                >
                                  <Eye aria-hidden="true" className="size-4" />
                                  View photos
                                </Button>
                              )}
                              {canManageUnitPictures && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="w-full gap-1.5 px-2 shadow-none"
                                  aria-label={`Edit ${selectedUnit.code} picture`}
                                  onClick={() => setPictureUnitId(selectedUnit.id)}
                                >
                                  <ImagePlus aria-hidden="true" className="size-4" />
                                  {unitImageUrl(selectedUnit) ? "Change photo" : "Add photo"}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                        {canManageUnits && (
                          <div className="grid grid-cols-2 gap-2 border-t border-border/60 px-2 py-1 [&_button]:h-8 [&_button]:w-full [&_button]:text-xs">
                            <RenameUnitButton
                              unitId={selectedUnit.id}
                              code={selectedUnit.code}
                              showLabel
                            />
                            <div className="[&_button]:text-destructive">
                              <RemoveUnitButton
                                unitId={selectedUnit.id}
                                code={selectedUnit.code}
                                showLabel
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </UnitFloorScene>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Click a unit label to use its controls. Scroll or pinch to zoom; drag to rotate.
                  Unit counts follow the saved floors; room sizes and positions are illustrative.
                </p>
              </div>
            )}

            {(view === "photos" || !sceneUnits.length) && (
              <ul className="mt-4 grid max-h-[70vh] grid-cols-1 lg:max-h-[30rem] gap-4 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {activeUnits.map((unit) => (
                  <li key={unit.id}>
                    <InventoryUnitCard
                      code={unit.code}
                      status={unit.status}
                      imageUrl={unitImageUrl(unit)}
                      onPreview={unitImageUrl(unit) ? () => setPreviewUnitId(unit.id) : undefined}
                      onEditPicture={
                        canManageUnitPictures ? () => setPictureUnitId(unit.id) : undefined
                      }
                      actions={
                        canManageUnits ? (
                          <>
                            <RenameUnitButton unitId={unit.id} code={unit.code} />
                            <RemoveUnitButton unitId={unit.id} code={unit.code} />
                          </>
                        ) : undefined
                      }
                      statusControl={
                        canManageUnits ? (
                          <UnitStatusControl unitId={unit.id} status={unit.status} />
                        ) : undefined
                      }
                    />
                  </li>
                ))}

                {!activeUnits.length && (
                  <li className="col-span-full text-[13px] text-muted-foreground">No units yet.</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

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
  );
}
