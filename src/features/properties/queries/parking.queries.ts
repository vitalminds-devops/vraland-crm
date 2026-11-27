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
  /** The opportunity holding it while reserved or sold; null when free. */
  reservedDealId: string | null;
  /** Its parking type, such as Tandem; null for a plain slot. */
  parkingTypeName: string | null;
  accessible: boolean;
  /** What the slot costs, set on the slot or by its parking type. */
  price: string | null;
  reservationFee: string | null;
  /** The same amounts, for the slot window's price fields. */
  ownPrice: string | null;
  ownReservationFee: string | null;
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
    propertyId: propertyParkingSlots.propertyId,
    parkingSlotId: propertyParkingSlots.id,
  });
  const rows = await db
    .select({
      id: propertyParkingSlots.id,
      code: propertyParkingSlots.identifier,
      status: propertyParkingSlots.status,
      floorId: propertyParkingSlots.floorId,
      reservedDealId: propertyParkingSlots.reservedDealId,
      // Its parking type's name, from the property's types.
      parkingTypeName: sql<string | null>`(select t->>'name'
        from jsonb_array_elements(${properties.parkingTypes}) t
        where t->>'id' = ${propertyParkingSlots.parkingTypeId})`,
      accessible: sql<boolean>`${granted}`,
      price: propertyParkingSlots.price,
      reservationFee: propertyParkingSlots.reservationFee,
      ownPrice: propertyParkingSlots.price,
      ownReservationFee: propertyParkingSlots.reservationFee,
    })
    .from(propertyParkingSlots)
    .innerJoin(properties, eq(propertyParkingSlots.propertyId, properties.id))
    .where(
      and(
        eq(propertyParkingSlots.propertyId, propertyId),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
        includeHidden ? undefined : granted,
      ),
    );
  return rows.sort((a, b) => compareParkingCodes(a.code, b.code));
}
