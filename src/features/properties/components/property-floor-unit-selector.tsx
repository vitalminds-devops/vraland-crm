"use client";

import { type ReactNode, useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { unitStatusLabel, unitStatusToneFor } from "../lib/unit-codes";
import type { UnitGroup } from "../lib/floor-groups";
import { formatMoney, formatMoneyShort } from "@/lib/utils/money";

const selectClass =
  "h-[42px] w-full rounded-lg border border-border/60 bg-background px-3 text-base text-foreground sm:text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-60 cursor-pointer appearance-none pr-9";

const EMPTY_PROPERTIES: Property[] = [];
const EMPTY_FLOORS: Floor[] = [];
const EMPTY_UNITS: Unit[] = [];

type Property = { id: string; title: string; addressLine1: string | null };
type Floor = {
  id: string;
  level: number;
  label: string;
  /** The floor's picture, served by `/api/properties/floors/[id]/image`. */
  imageUrl: string | null;
};
type Unit = {
  id: string;
  code: string;
  status: string;
  imageStorageKey: string | null;
  group?: UnitGroup | null;
  typeName?: string | null;
  price?: string | null;
  reservationFee?: string | null;
};

/** What a unit chip says on hover and to screen readers: its section, type, price and fee. */
const unitDetails = (unit: Unit) => [
  unit.group?.name,
  unit.typeName,
  formatMoney(unit.price),
  unit.reservationFee && `Reservation fee ${formatMoney(unit.reservationFee)}`,
];

type Props = {
  /** Development ID to load properties for */
  developmentId: string | null;
  /** Units already preferred on the record being edited. */
  initialUnitIds?: readonly string[];
  initialBuildingId?: string | null;
  unitIds?: readonly string[];
  onBuildingChange?: (buildingId: string | null) => void;
  /** Called with the whole set whenever a unit is ticked or unticked. */
  onUnitsChange: (unitIds: string[]) => void;
  selectClassName?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** More to pick on the chosen floor, under its units: its parking slots. */
  floorExtras?: (floorId: string) => ReactNode;
};

export function PropertyFloorUnitSelector({
  developmentId,
  initialUnitIds,
  initialBuildingId,
  unitIds: controlledUnitIds,
  onBuildingChange,
  onUnitsChange,
  selectClassName = selectClass,
  disabled = false,
  floorExtras,
}: Props) {
  const [pending, startTransition] = useTransition();

  const [buildingData, setBuildingData] = useState<{
    key: string;
    rows: Property[];
  }>({ key: "", rows: EMPTY_PROPERTIES });
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(
    initialBuildingId ?? null,
  );
  const [floorData, setFloorData] = useState<{ key: string; rows: Floor[] }>({
    key: "",
    rows: EMPTY_FLOORS,
  });
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [unitData, setUnitData] = useState<{
    key: string;
    rows: Unit[];
  }>({ key: "", rows: EMPTY_UNITS });
  const [internalUnitIds, setSelectedUnitIds] = useState<string[]>([...(initialUnitIds ?? [])]);
  const selectedUnitIds = controlledUnitIds ?? internalUnitIds;

  useEffect(() => {
    onBuildingChange?.(selectedBuildingId);
  }, [selectedBuildingId, onBuildingChange]);

  useEffect(() => {
    if (!developmentId) return;
    const controller = new AbortController();

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/properties?developmentId=${encodeURIComponent(developmentId)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Failed to load properties");
        const data = await response.json();
        setBuildingData({ key: developmentId, rows: data });
        // A lone building or floor is picked automatically.
        setSelectedBuildingId((current) =>
          data.some((building: Property) => building.id === current)
            ? current
            : data.length === 1
              ? data[0].id
              : null,
        );
        setSelectedFloorId(null);
      } catch {
        if (controller.signal.aborted) return;
        notify("Properties could not be loaded.", "error");
        setBuildingData({ key: developmentId, rows: EMPTY_PROPERTIES });
      }
    });

    return () => controller.abort();
  }, [developmentId]);

  // Load floors when property changes
  useEffect(() => {
    if (!selectedBuildingId) return;
    const controller = new AbortController();

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/properties/floors?buildingId=${encodeURIComponent(selectedBuildingId)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Failed to load floors");
        const data = await response.json();
        setFloorData({ key: selectedBuildingId, rows: data });
        setSelectedFloorId(data.length === 1 ? data[0].id : null);
      } catch {
        if (controller.signal.aborted) return;
        notify("Floors could not be loaded.", "error");
        setFloorData({ key: selectedBuildingId, rows: EMPTY_FLOORS });
      }
    });

    return () => controller.abort();
  }, [selectedBuildingId]);

  // Load units when floor changes
  useEffect(() => {
    if (!selectedFloorId) return;
    const controller = new AbortController();

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/properties/units?floorId=${encodeURIComponent(selectedFloorId)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Failed to load units");
        const data = await response.json();
        setUnitData({
          key: selectedFloorId,
          rows: data.units ?? EMPTY_UNITS,
        });
      } catch {
        if (controller.signal.aborted) return;
        notify("Units could not be loaded.", "error");
        setUnitData({
          key: selectedFloorId,
          rows: EMPTY_UNITS,
        });
      }
    });

    return () => controller.abort();
  }, [selectedFloorId]);

  const buildings =
    developmentId && buildingData.key === developmentId ? buildingData.rows : EMPTY_PROPERTIES;
  const floors =
    selectedBuildingId && floorData.key === selectedBuildingId ? floorData.rows : EMPTY_FLOORS;
  const units = selectedFloorId && unitData.key === selectedFloorId ? unitData.rows : EMPTY_UNITS;
  const elsewhere = selectedUnitIds.filter((id) => !units.some((unit) => unit.id === id)).length;

  // Handle unit selection
  const toggleUnit = (unitId: string) => {
    const next = selectedUnitIds.includes(unitId)
      ? selectedUnitIds.filter((id) => id !== unitId)
      : [...selectedUnitIds, unitId];
    setSelectedUnitIds(next);
    onUnitsChange(next);
  };

  const clearUnits = () => {
    setSelectedUnitIds([]);
    onUnitsChange([]);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Property
          <NativeSelect
            value={selectedBuildingId ?? ""}
            onChange={(event) => {
              if (onBuildingChange) clearUnits();
              setSelectedBuildingId(event.target.value || null);
              setSelectedFloorId(null);
            }}
            disabled={disabled || !developmentId || pending}
            className={selectClassName}
          >
            <NativeSelectOption value="">Select property</NativeSelectOption>
            {buildings.map((building) => (
              <NativeSelectOption key={building.id} value={building.id}>
                {building.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Floor
          <NativeSelect
            value={selectedFloorId ?? ""}
            onChange={(event) => setSelectedFloorId(event.target.value || null)}
            disabled={disabled || !selectedBuildingId || pending}
            className={selectClassName}
          >
            <NativeSelectOption value="">Select floor</NativeSelectOption>
            {floors.map((floor) => (
              <NativeSelectOption key={floor.id} value={floor.id}>
                {floor.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>

      {selectedFloorId &&
        (pending && !units.length ? (
          <UnitChipsSkeleton />
        ) : units.length ? (
          <div
            role="group"
            aria-label="Units"
            className="flex max-h-48 flex-wrap gap-2 overflow-y-auto p-1"
          >
            {units.map((unit) => {
              const selected = selectedUnitIds.includes(unit.id);
              return (
                <button
                  key={unit.id}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  aria-label={[
                    `Unit ${unit.code}`,
                    ...unitDetails(unit),
                    unitStatusLabel(unit.status),
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  title={[...unitDetails(unit), unitStatusLabel(unit.status)]
                    .filter(Boolean)
                    .join(" · ")}
                  disabled={disabled || pending || (unit.status !== "available" && !selected)}
                  onClick={() => toggleUnit(unit.id)}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary/50 hover:bg-primary/5",
                  )}
                >
                  {selected ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn("size-2.5 rounded-full border", unitStatusToneFor(unit.status))}
                    />
                  )}
                  {unit.code}
                  {unit.group && (
                    <span
                      className={selected ? "opacity-80" : undefined}
                      style={selected ? undefined : { color: unit.group.hex }}
                    >
                      {unit.group.name}
                    </span>
                  )}
                  {unit.price && (
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        selected ? "opacity-80" : "text-muted-foreground",
                      )}
                    >
                      {formatMoneyShort(unit.price)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">No units to display.</p>
        ))}

      {/* Units and parking share floors, so the floor's slots are picked right here too. */}
      {selectedFloorId && floorExtras?.(selectedFloorId)}

      {selectedUnitIds.length > 0 && (
        <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
          {selectedUnitIds.length} {selectedUnitIds.length === 1 ? "unit" : "units"} selected
          {/* Picks on other floors (or ones that went away) aren't shown above; say so. */}
          {selectedFloorId && elsewhere > 0 && ` · ${elsewhere} not on this floor`}
          <button
            type="button"
            onClick={clearUnits}
            disabled={disabled || pending}
            className="font-medium text-primary hover:underline disabled:opacity-60"
          >
            Clear
          </button>
        </p>
      )}
    </div>
  );
}

function UnitChipsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-2">
      {Array.from({ length: 6 }, (_, chip) => (
        <div key={chip} className="h-7 w-16 animate-pulse rounded-full bg-muted/70" />
      ))}
    </div>
  );
}
