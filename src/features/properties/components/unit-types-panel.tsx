"use client";

import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils/money";
import { deleteUnitType } from "../actions/unit-type.actions";
import { formatArea, type UnitTypeFacts } from "../lib/floor-layout";
import { UnitThumbnail } from "./layout-art";
import { UnitDesigner } from "./unit-designer";
import type { ParkingType } from "../lib/parking-types";
import { ParkingTypeDialog, ParkingTypeRow } from "./parking-type-row";

/** The property's designed unit and parking types, which floors are built from. */
export function UnitTypesPanel({
  propertyId,
  unitTypes,
  currency,
  parkingTypes,
}: {
  propertyId: string;
  unitTypes: UnitTypeFacts[];
  currency: string;
  parkingTypes: ParkingType[];
}) {
  const [editingParking, setEditingParking] = useState<ParkingType | "new" | null>(null);
  const count = unitTypes.length + parkingTypes.length;
  const [editing, setEditing] = useState<UnitTypeFacts | "new" | { copyOf: UnitTypeFacts } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const remove = (type: UnitTypeFacts) => {
    if (!window.confirm(`Remove ${type.name}?`)) return;
    startTransition(async () => {
      const result = await deleteUnitType(type.id);
      notify(
        result.success ? "Unit type removed." : result.error.message,
        result.success ? "success" : "error",
      );
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="text-sm font-semibold">
          Unit & parking types
          {count > 0 && (
            <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 align-middle text-[11px] font-normal text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </h3>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setEditing("new")}
          >
            <Plus aria-hidden="true" className="size-4" />
            Design unit
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setEditingParking("new")}
          >
            <Plus aria-hidden="true" className="size-4" />
            Design parking
          </Button>
        </div>
      </div>
      {count ? (
        <ul className="-mx-4 divide-y divide-border/40 border-y border-border/40">
          {unitTypes.map((type) => (
            <li
              key={type.id}
              className="group relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
            >
              <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted/50">
                {type.layout ? (
                  <UnitThumbnail design={type.layout} className="size-12" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">No design</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                {/* The whole card opens the designer; the buttons below sit above this link. */}
                <button
                  type="button"
                  className="block w-full truncate text-left text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary/40"
                  onClick={() => setEditing(type)}
                >
                  {type.name}
                </button>
                <p className="truncate text-xs text-muted-foreground tabular-nums">
                  {[
                    type.bedrooms !== null ? `${type.bedrooms} BR` : null,
                    type.layout ? `${type.layout.width} × ${type.layout.depth} m` : null,
                    formatArea(type.floorArea === null ? null : Number(type.floorArea)),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No details yet"}
                </p>
                <p className="mt-0.5 text-xs font-medium tabular-nums">
                  {type.price ? (
                    formatMoney(type.price)
                  ) : (
                    <span className="font-normal text-muted-foreground">No price</span>
                  )}
                </p>
              </div>
              <div className="relative flex shrink-0 gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground hover:text-foreground"
                  aria-label={`Copy ${type.name}`}
                  title="Copy"
                  onClick={() => setEditing({ copyOf: type })}
                >
                  <Copy aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground hover:text-foreground"
                  aria-label={`Design ${type.name}`}
                  onClick={() => setEditing(type)}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove ${type.name}`}
                  disabled={pending}
                  onClick={() => remove(type)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </li>
          ))}
          {parkingTypes.map((type) => (
            <ParkingTypeRow
              key={type.id}
              propertyId={propertyId}
              currency={currency}
              type={type}
              onEdit={() => setEditingParking(type)}
            />
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-[13px] text-muted-foreground">
          No unit or parking designs yet.
        </p>
      )}
      {editingParking && (
        <ParkingTypeDialog
          propertyId={propertyId}
          type={editingParking === "new" ? null : editingParking}
          onClose={() => setEditingParking(null)}
        />
      )}
      {editing && (
        <UnitDesigner
          propertyId={propertyId}
          type={editing === "new" || "copyOf" in editing ? null : editing}
          copyOf={editing !== "new" && "copyOf" in editing ? editing.copyOf : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
