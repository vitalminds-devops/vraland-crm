"use client";

import { Eye, ImagePlus, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { UnitGroup } from "../lib/floor-groups";
import {
  formatArea,
  roomCounts,
  roomLabels,
  type FloorLayout,
  type UnitDesign,
  type UnitTypeFacts,
} from "../lib/floor-layout";
import { unitStatusLabel, unitStatusToneFor } from "../lib/unit-codes";
import { DetailList, FloorItemDialog } from "./floor-item-dialog";
import { UnitThumbnail } from "./layout-art";
import { RenameUnitButton, UnitStatusControl } from "./unit-controls";
import { UnitDetailsButton } from "./unit-details-dialog";

/** Room around the unit on its little stage; a balcony may stick out up to 2.5 m. */
const MARGIN = 3;

/** A unit picked on the floor view: its design drawn large, with its details and actions beside it. */
export function UnitViewDialog({
  unit,
  floorLabel,
  facts,
  design,
  reservationFee,
  monthlyAmortization,
  imageUrl,
  unitTypes,
  billedPrices,
  canManageUnits,
  canManagePrices,
  canManageUnitPictures,
  onPreviewPhoto,
  onEditPhoto,
  onClose,
}: {
  unit: {
    id: string;
    code: string;
    status: string;
    group?: UnitGroup | null;
    unitTypeId?: string | null;
    floorArea?: string | null;
    price?: string | null;
  };
  floorLabel: string;
  facts: {
    typeName: string | null;
    bedrooms: number | null;
    floorArea: number | null;
    price: number | null;
  };
  design: UnitDesign | null;
  /** The property's reservation fee, already formatted. */
  reservationFee: string | null;
  /** Its type's monthly amortization, already formatted. */
  monthlyAmortization: string | null;
  imageUrl: string | null;
  unitTypes: UnitTypeFacts[];
  billedPrices: string[];
  canManageUnits: boolean;
  canManagePrices: boolean;
  canManageUnitPictures: boolean;
  onPreviewPhoto: () => void;
  onEditPhoto: () => void;
  onClose: () => void;
}) {
  const rooms = design ? roomCounts(design) : [];
  const stage: FloorLayout | null = design && {
    width: design.width + MARGIN * 2,
    depth: design.depth + MARGIN * 2,
    units: [
      {
        id: "unit",
        x: MARGIN,
        y: MARGIN,
        w: design.width,
        h: design.depth,
        rotation: 0,
        flip: false,
        typeId: "design",
        unitId: unit.id,
      },
    ],
    spaces: [],
  };

  return (
    <FloorItemDialog
      // View photos sits in the 3D view's toolbar, beside Hide labels.
      sceneActions={
        imageUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 shrink-0 gap-2 px-3 text-[13px] shadow-none focus-visible:ring-2 focus-visible:ring-inset sm:h-9"
            onClick={onPreviewPhoto}
          >
            <Eye aria-hidden="true" className="size-4" />
            View photos
          </Button>
        )
      }
      title={`Unit ${unit.code}`}
      subtitle={
        <>
          {floorLabel}
          {unit.group && (
            <>
              {" · "}
              <span className="font-medium" style={{ color: unit.group.hex }}>
                {unit.group.name}
              </span>
            </>
          )}
        </>
      }
      scene={
        design && stage
          ? {
              floorKey: unit.id,
              layout: stage,
              units: [{ id: unit.id, code: unit.code, status: unit.status }],
              designs: new Map([["design", design]]),
            }
          : null
      }
      flat={
        design ? (
          <UnitThumbnail design={design} className="max-h-[60dvh] w-full p-6" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <LayoutGrid aria-hidden="true" className="size-6" />
            No design for this unit&apos;s type.
          </div>
        )
      }
      footer={
        (canManageUnits || canManageUnitPictures) && (
          <div className="grid shrink-0 grid-cols-2 gap-1 border-t border-border/60 p-3 md:grid-cols-3 [&_button]:h-11 [&_button]:w-full [&_button]:gap-2 [&_button]:px-2 [&_button]:text-xs [&_button]:whitespace-nowrap sm:[&_button]:h-10">
            {canManageUnits && (
              <div className="col-span-2 md:col-span-1">
                <UnitDetailsButton
                  unit={{
                    id: unit.id,
                    code: unit.code,
                    unitTypeId: unit.unitTypeId ?? null,
                    floorArea: unit.floorArea ?? null,
                    price: unit.price ?? null,
                    status: unit.status,
                  }}
                  unitTypes={unitTypes}
                  billedPrices={billedPrices}
                  canManagePrices={canManagePrices}
                />
              </div>
            )}
            {canManageUnits && <RenameUnitButton unitId={unit.id} code={unit.code} showLabel />}
            {canManageUnitPictures && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary"
                onClick={onEditPhoto}
              >
                <ImagePlus aria-hidden="true" className="size-4" />
                {imageUrl ? "Change photo" : "Add photo"}
              </Button>
            )}
          </div>
        )
      }
      onClose={onClose}
    >
      <DetailList
        rows={[
          ["Type", facts.typeName],
          ["Size", design ? `${design.width} × ${design.depth} m` : null],
          ["Floor area", formatArea(facts.floorArea)],
          ["Bedrooms", facts.bedrooms !== null ? String(facts.bedrooms) : null],
          ["Price", formatMoney(facts.price)],
          ["Reservation fee", reservationFee],
          ["Monthly amortization", monthlyAmortization],
        ]}
      />

      {rooms.length > 0 && (
        <ul aria-label="Rooms" className="flex flex-wrap gap-1.5 px-5 pt-4">
          {rooms.map(([kind, count]) => (
            <li
              key={kind}
              className="rounded-md bg-muted/60 px-2.5 py-1 text-[12px] leading-4 text-foreground/80"
            >
              {count > 1 ? `${count} ` : ""}
              {roomLabels[kind]}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 p-5">
        {canManageUnits ? (
          <label className="block space-y-1.5 text-xs font-medium text-muted-foreground [&_select]:h-11 [&_select]:border-border [&_select]:bg-card [&_select]:text-[13px] [&_select]:text-foreground [&_select]:shadow-none sm:[&_select]:h-10">
            <span>Status</span>
            <UnitStatusControl unitId={unit.id} status={unit.status} />
          </label>
        ) : (
          <span
            className={cn(
              "inline-block rounded-full border px-2.5 py-1 text-xs font-medium",
              unitStatusToneFor(unit.status),
            )}
          >
            {unitStatusLabel(unit.status)}
          </span>
        )}
      </div>
    </FloorItemDialog>
  );
}
