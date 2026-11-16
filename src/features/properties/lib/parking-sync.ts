import "server-only";

import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { properties, propertyParkingSlots } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Keeps the property's saved parking count in step with its slots. */
export async function syncParkingCount(tx: Tx, propertyId: string) {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(propertyParkingSlots)
    .where(eq(propertyParkingSlots.buildingId, propertyId));
  await tx
    .update(properties)
    .set({ parkingSpaces: total, updatedAt: new Date() })
    .where(eq(properties.id, propertyId));
}
