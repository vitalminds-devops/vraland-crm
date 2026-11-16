import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { properties, propertyParkingSlots } from "@/db/schema";
import type { AuthorizationContext } from "@/lib/permissions/policy";
import { grantedParkingCondition } from "@/lib/permissions/property-access";
import { compareParkingCodes } from "../lib/parking-codes";

export type ParkingSlot = {
  id: string;
  code: string;
  status: string;
  floorId: string | null;
  accessible: boolean;
};

/**
 * A property's parking slots the caller may see. With `includeHidden` (the access editor), every
 * slot comes back and `accessible` says which the caller holds. Callers show them only after the
 * property itself is visible.
 */
export async function listParkingSlots(
  context: AuthorizationContext,
  propertyId: string,
  { includeHidden = false }: { includeHidden?: boolean } = {},
): Promise<ParkingSlot[]> {
  const granted = grantedParkingCondition(context, {
    propertyId: propertyParkingSlots.buildingId,
    parkingSlotId: propertyParkingSlots.id,
  });
  const rows = await db
    .select({
      id: propertyParkingSlots.id,
      code: propertyParkingSlots.code,
      status: propertyParkingSlots.status,
      floorId: propertyParkingSlots.floorId,
      accessible: sql<boolean>`${granted}`,
    })
    .from(propertyParkingSlots)
    .innerJoin(properties, eq(propertyParkingSlots.buildingId, properties.id))
    .where(
      and(
        eq(propertyParkingSlots.buildingId, propertyId),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
        includeHidden ? undefined : granted,
      ),
    );
  return rows.sort((a, b) => compareParkingCodes(a.code, b.code));
}
