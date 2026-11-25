"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ParkingPicker } from "@/features/properties/components/parking-picker";
import { getOpportunityParking } from "../actions/opportunity.actions";

const UNASSIGNED = "unassigned";

export function OpportunityParkingSelector({
  developmentId,
  buildingId,
  selectedIds,
  onChange,
  disabled,
  dealId,
  floorId: chosenFloor,
}: {
  developmentId: string;
  buildingId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  /** The floor chosen above: only its slots show, with no floor list of their own. */
  floorId?: string;
  /** The opportunity being changed: the slots it holds stay selectable, only for it. */
  dealId?: string;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getOpportunityParking>>>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [floorId, setFloorId] = useState("");
  useEffect(() => {
    let live = true;
    getOpportunityParking({ developmentId, buildingId }, dealId)
      .then((result) => {
        if (!live) return;
        setData(result);
        setFailed(!result);
        if (result) {
          const choices = [
            ...result.floors.map((floor) => floor.id),
            ...(result.slots.some((slot) => !slot.floorId) ? [UNASSIGNED] : []),
          ];
          setFloorId(choices.length === 1 ? choices[0] : "");
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [developmentId, buildingId, dealId, retry]);

  if (failed)
    return (
      <div role="alert" className="text-sm text-destructive">
        Parking could not be loaded.{" "}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setFailed(false);
            setRetry(retry + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  if (!data)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading parking slots…
      </p>
    );
  const slots = data.slots;
  const onFloor = chosenFloor ?? floorId;
  const visible = slots.filter((slot) => (slot.floorId ?? UNASSIGNED) === onFloor);
  const unavailable = selectedIds.some(
    (id) => !slots.some((slot) => slot.id === id && slot.status === "available"),
  );
  // Picked with its floor's units: no list of its own, and nothing when the floor has no parking.
  if (chosenFloor) {
    if (!visible.length) return null;
    return (
      <div className="space-y-2">
        <p className="text-[13px] font-medium">Parking on this floor</p>
        <ParkingPicker
          compact
          slots={visible}
          selectedIds={selectedIds}
          selectionLabel="selected"
          availableOnly
          disabled={disabled}
          onToggle={(id) =>
            onChange(
              selectedIds.includes(id)
                ? selectedIds.filter((value) => value !== id)
                : [...selectedIds, id],
            )
          }
        />
        {unavailable && (
          <p role="alert" className="text-sm text-destructive">
            Some selected slots are no longer available. Choose available slots.
          </p>
        )}
        {selectedIds.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {selectedIds.length} parking {selectedIds.length === 1 ? "slot" : "slots"} selected
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {data.slots.length ? (
        <>
          <NativeSelect
            aria-label="Parking floor"
            value={floorId}
            disabled={disabled}
            onChange={(event) => setFloorId(event.target.value)}
          >
            <NativeSelectOption value="">Select parking floor</NativeSelectOption>
            {data.floors.map((floor) => (
              <NativeSelectOption key={floor.id} value={floor.id}>
                {floor.label}
              </NativeSelectOption>
            ))}
            {data.slots.some((slot) => !slot.floorId) && (
              <NativeSelectOption value={UNASSIGNED}>
                Unassigned / Ground Parking
              </NativeSelectOption>
            )}
          </NativeSelect>
          {floorId && (
            <ParkingPicker
              compact
              slots={visible}
              selectedIds={selectedIds}
              selectionLabel="selected"
              availableOnly
              disabled={disabled}
              onToggle={(id) =>
                onChange(
                  selectedIds.includes(id)
                    ? selectedIds.filter((value) => value !== id)
                    : [...selectedIds, id],
                )
              }
            />
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No parking slots available in this property.
        </p>
      )}
      {unavailable && (
        <p role="alert" className="text-sm text-destructive">
          Some selected slots are no longer available. Clear the selection and choose available
          slots.
        </p>
      )}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {selectedIds.length} parking {selectedIds.length === 1 ? "slot" : "slots"} selected
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto px-1 py-0 text-xs text-primary"
            disabled={disabled}
            onClick={() => onChange([])}
          >
            Clear parking selection
          </Button>
        </div>
      )}
    </div>
  );
}
