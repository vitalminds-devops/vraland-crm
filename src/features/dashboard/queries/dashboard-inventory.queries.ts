import "server-only";

import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { floors, properties, parkingSlots, units } from "@/db/schema";
import {
  grantedParkingCondition,
  grantedPropertyCondition,
  grantedFloorsCondition,
  grantedUnitsCondition,
} from "@/lib/permissions/property-access";

import type { DashboardScope } from "./dashboard-scope.queries";

/** Properties, floors, units and parking. */
export async function inventoryRows({ context, propertyScope }: DashboardScope) {
  const [
    propertyRows,
    reservedPropertyRows,
    inventoryStatusRows,
    floorRows,
    unitAvailabilityRows,
    parkingAvailabilityRows,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          eq(properties.status, "active"),
          isNull(properties.deletedAt),
          grantedPropertyCondition(context, { propertyId: properties.id }),
          propertyScope,
        ),
      ),
    db
      .select({ value: count() })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          inArray(properties.status, ["reserved", "under_contract"]),
          isNull(properties.deletedAt),
          grantedPropertyCondition(context, { propertyId: properties.id }),
          propertyScope,
        ),
      ),
    db
      .select({ status: properties.status, value: count() })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          grantedPropertyCondition(context, { propertyId: properties.id }),
          propertyScope,
        ),
      )
      .groupBy(properties.status)
      .orderBy(desc(count())),
    // Floors of the properties the viewer can see, and how many properties have them.
    db
      .select({
        floors: count(),
        properties: sql<number>`count(distinct ${floors.propertyId})::int`,
      })
      .from(floors)
      .innerJoin(properties, eq(floors.propertyId, properties.id))
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          // Floor by floor: an agent given 2 floors of a tower counts 2, like the unit meters.
          grantedFloorsCondition(context, { propertyId: floors.propertyId, floorId: floors.id }),
          propertyScope,
        ),
      ),
    // Units the viewer can see, and how many are still available.
    db
      .select({
        total: count(),
        available: sql<number>`(count(*) filter (where ${units.status} = 'available'))::int`,
      })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          grantedUnitsCondition(context, {
            propertyId: units.propertyId,
            floorId: units.floorId,
            unitId: units.id,
          }),
          propertyScope,
        ),
      ),
    // Parking slots the viewer can see, and how many are still available.
    db
      .select({
        total: count(),
        available: sql<number>`(count(*) filter (where ${parkingSlots.status} = 'available'))::int`,
      })
      .from(parkingSlots)
      .innerJoin(properties, eq(parkingSlots.propertyId, properties.id))
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          grantedParkingCondition(context, {
            propertyId: parkingSlots.propertyId,
            parkingSlotId: parkingSlots.id,
          }),
          propertyScope,
        ),
      ),
  ]);
  return {
    propertyRows,
    reservedPropertyRows,
    inventoryStatusRows,
    floorRows,
    unitAvailabilityRows,
    parkingAvailabilityRows,
  };
}
