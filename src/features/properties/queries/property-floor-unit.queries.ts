import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { floors, properties, units } from "@/db/schema";
import type { UnitIdentifierStyle } from "@/features/properties/lib/unit-codes";
import { AuthorizationError, requirePermission } from "@/lib/permissions/authorization";
import type { AuthorizationContext } from "@/lib/permissions/policy";
import { canGrantUnitAccess } from "@/lib/permissions/policy";
import { dataScopeCondition } from "@/lib/permissions/scope";
import {
  grantedFloorsCondition,
  grantedPropertyCondition,
  grantedUnitsCondition,
} from "@/lib/permissions/property-access";

function propertyAccessCondition(context: AuthorizationContext) {
  return and(
    dataScopeCondition(context, {
      organizationId: properties.organizationId,
    }),
    isNull(properties.deletedAt),
    grantedPropertyCondition(context, { propertyId: properties.id }),
  );
}

/** The property a single floor or unit hangs off, or null if the caller cannot reach it. */
async function findProperty(context: AuthorizationContext, propertyId: string) {
  const [row] = await db
    .select({
      id: properties.id,
      title: properties.title,
      propertyCode: properties.propertyCode,
      floorCount: properties.floorCount,
      unitsPerFloor: properties.unitsPerFloor,
      unitIdentifierStyle: properties.unitIdentifierStyle,
    })
    .from(properties)
    .where(and(eq(properties.id, propertyId), propertyAccessCondition(context)))
    .limit(1);
  return row ?? null;
}

export async function getPropertiesForDevelopment(
  context: AuthorizationContext,
  developmentId: string,
) {
  const rows = await db
    .select({
      id: properties.id,
      title: properties.title,
      addressLine1: properties.addressLine1,
      askingPrice: properties.askingPrice,
      parkingPrice: properties.parkingPrice,
      parkingSpaces: properties.parkingSpaces,
      currency: properties.currency,
    })
    .from(properties)
    .where(and(eq(properties.developmentId, developmentId), propertyAccessCondition(context)))
    .orderBy(properties.title);

  return rows;
}

export async function getFloorsForProperty(context: AuthorizationContext, propertyId: string) {
  const rows = await db
    .select({
      id: floors.id,
      level: floors.level,
      label: floors.label,
      imageStorageKey: floors.imageStorageKey,
    })
    .from(floors)
    .innerJoin(properties, eq(floors.buildingId, properties.id))
    .where(
      and(
        eq(floors.buildingId, propertyId),
        propertyAccessCondition(context),
        grantedFloorsCondition(context, {
          propertyId: floors.buildingId,
          floorId: floors.id,
        }),
      ),
    )
    .orderBy(asc(floors.level));

  return rows;
}

export async function getFloorImageRecord(floorId: string) {
  const context = await requirePermission("properties.view");
  const [row] = await db
    .select({
      id: floors.id,
      storageKey: floors.imageStorageKey,
      mimeType: floors.imageMimeType,
      label: floors.label,
    })
    .from(floors)
    .innerJoin(properties, eq(floors.buildingId, properties.id))
    .where(
      and(
        eq(floors.id, floorId),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
        // The image is served only where the floor itself would be listed.
        propertyAccessCondition(context),
        grantedFloorsCondition(context, { propertyId: floors.buildingId, floorId: floors.id }),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getUnitImageRecord(unitId: string) {
  const context = await requirePermission("properties.view");
  const [row] = await db
    .select({
      id: units.id,
      storageKey: units.imageStorageKey,
      mimeType: units.imageMimeType,
      code: units.code,
    })
    .from(units)
    .innerJoin(properties, eq(units.buildingId, properties.id))
    .where(
      and(
        eq(units.id, unitId),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
        // The image is served only where the unit itself would be listed.
        propertyAccessCondition(context),
        grantedUnitsCondition(context, {
          propertyId: units.buildingId,
          floorId: units.floorId,
          unitId: units.id,
        }),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getUnitsForFloor(context: AuthorizationContext, floorId: string) {
  const rows = await db
    .select({
      id: units.id,
      code: units.code,
      status: units.status,
      imageStorageKey: units.imageStorageKey,
    })
    .from(units)
    .innerJoin(floors, eq(units.floorId, floors.id))
    .innerJoin(properties, eq(units.buildingId, properties.id))
    .where(
      and(
        eq(units.floorId, floorId),
        propertyAccessCondition(context),
        grantedUnitsCondition(context, {
          propertyId: units.buildingId,
          floorId: units.floorId,
          unitId: units.id,
        }),
      ),
    )
    .orderBy(units.code);

  return rows;
}

export type PropertyInventory = {
  property: {
    id: string;
    title: string;
    propertyCode: string;
    floorCount: number | null;
    unitsPerFloor: number | null;
    unitIdentifierStyle: UnitIdentifierStyle;
  } | null;
  floors: {
    id: string;
    level: number;
    label: string;
    imageStorageKey: string | null;
    /** Units the caller may see on this floor. */
    unitCount: number;
  }[];
  units: {
    id: string;
    code: string;
    status: string;
    floorId: string;
    imageStorageKey: string | null;
  }[];
};

async function loadInventory(
  context: AuthorizationContext,
  propertyId: string,
): Promise<PropertyInventory> {
  const property = await findProperty(context, propertyId);
  if (!property)
    return {
      property: null,
      floors: [],
      units: [],
    };

  const floorFilter = grantedFloorsCondition(context, {
    propertyId: floors.buildingId,
    floorId: floors.id,
  });
  const unitFilter = grantedUnitsCondition(context, {
    propertyId: units.buildingId,
    floorId: units.floorId,
    unitId: units.id,
  });

  const [floorRows, unitRows] = await Promise.all([
    db
      .select({
        id: floors.id,
        level: floors.level,
        label: floors.label,
        imageStorageKey: floors.imageStorageKey,
      })
      .from(floors)
      .where(and(eq(floors.buildingId, propertyId), floorFilter))
      .orderBy(asc(floors.level)),
    db
      .select({
        id: units.id,
        code: units.code,
        status: units.status,
        floorId: units.floorId,
        imageStorageKey: units.imageStorageKey,
      })
      .from(units)
      .innerJoin(floors, eq(units.floorId, floors.id))
      .where(and(eq(units.buildingId, propertyId), unitFilter))
      .orderBy(asc(floors.level), asc(units.code)),
  ]);

  const perFloor = new Map<string, number>();
  for (const unit of unitRows) perFloor.set(unit.floorId, (perFloor.get(unit.floorId) ?? 0) + 1);

  return {
    property,
    floors: floorRows.map((floor) => ({
      ...floor,
      unitCount: perFloor.get(floor.id) ?? 0,
    })),
    units: unitRows,
  };
}

export async function getPropertyInventory(
  context: AuthorizationContext,
  propertyId: string,
): Promise<PropertyInventory> {
  return loadInventory(context, propertyId);
}

export async function getPropertyInventoryForGrants(
  context: AuthorizationContext,
  propertyId: string,
): Promise<PropertyInventory> {
  if (!canGrantUnitAccess(context))
    throw new AuthorizationError("You do not have permission to grant access to properties.");

  return loadInventory(context, propertyId);
}
