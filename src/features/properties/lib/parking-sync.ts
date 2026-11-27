import "server-only";

import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { floors, properties, parkingSlots } from "@/db/schema";
import { placeSlotsOnFloor } from "./parking-layout";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Keeps the property's saved parking count in step with its slots. */
export async function syncParkingCount(tx: Tx, propertyId: string) {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(parkingSlots)
    .where(eq(parkingSlots.propertyId, propertyId));
  await tx
    .update(properties)
    .set({ parkingSlotLimit: total, updatedAt: new Date() })
    .where(eq(properties.id, propertyId));
}

/** Slots that arrive on a floor with parking on its plan go onto the plan, so they show there. */
export async function placeOnDesignedFloor(tx: Tx, floorId: string | null, slotIds: string[]) {
  if (!floorId || !slotIds.length) return;
  const [floor] = await tx
    .select({ layout: floors.layout })
    .from(floors)
    .where(eq(floors.id, floorId))
    .for("update");
  if (!floor?.layout?.parking?.length) return;
  await tx
    .update(floors)
    .set({ layout: placeSlotsOnFloor(floor.layout, slotIds), updatedAt: new Date() })
    .where(eq(floors.id, floorId));
}
