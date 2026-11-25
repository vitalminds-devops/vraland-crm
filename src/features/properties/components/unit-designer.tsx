"use client";

import {
  Dialog,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UnitTypeFacts } from "../lib/floor-layout";
import { UnitTypeWorkspace } from "./unit-type-workspace";

/** Design a unit type in its own full-screen window, the same editor Design floor opens in place. */
export function UnitDesigner({
  propertyId,
  type,
  copyOf,
  canManagePrices,
  onClose,
}: {
  propertyId: string;
  type: UnitTypeFacts | null;
  /** A type to start a new one from: its rooms, size and price, under a new name. */
  copyOf?: UnitTypeFacts;
  canManagePrices: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50">
          <DialogPopup
            aria-describedby={undefined}
            className="flex h-dvh w-full flex-col overflow-hidden bg-card"
          >
            <DialogTitle className="sr-only">
              {type ? `Design ${type.name}` : copyOf ? `Copy ${copyOf.name}` : "Design a unit"}
            </DialogTitle>
            <UnitTypeWorkspace
              propertyId={propertyId}
              type={type}
              copyOf={copyOf}
              parentLabel="Unit types"
              canManagePrices={canManagePrices}
              onBack={onClose}
              onSaved={onClose}
            />
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
