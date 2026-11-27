import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  developments,
  floors,
  properties,
  propertyFeatureValues,
  propertyFeatures,
  propertyStatusHistory,
  units,
  users,
  unitTypes,
} from "@/db/schema";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import type { AuthorizationContext } from "@/lib/permissions/policy";
import { dataScopeCondition } from "@/lib/permissions/scope";
import {
  grantedFloorsCondition,
  grantedPropertyCondition,
  grantedUnitsCondition,
} from "@/lib/permissions/property-access";
import { propertyWriteScope } from "../queries/property-scope.queries";

type PropertyListFilters = { search?: string; status?: string; type?: string };

/** The properties list's filter, shared with its export. */
function propertyListWhere(context: AuthorizationContext, input: PropertyListFilters) {
  const scope = dataScopeCondition(context, {
    organizationId: properties.organizationId,
  });
  return and(
    eq(properties.organizationId, context.organizationId),
    isNull(properties.deletedAt),
    input.status ? eq(properties.status, input.status) : undefined,
    input.type ? eq(properties.propertyType, input.type) : undefined,
    input.search
      ? or(
          ilike(properties.title, `%${input.search}%`),
          ilike(properties.propertyCode, `%${input.search}%`),
          ilike(properties.city, `%${input.search}%`),
          ilike(properties.province, `%${input.search}%`),
        )
      : undefined,
    scope,
    grantedPropertyCondition(context, { propertyId: properties.id }),
  );
}

export async function listProperties(input: PropertyListFilters & { page: number }) {
  const context = await requirePermission("properties.view");
  const limit = 18;
  const where = propertyListWhere(context, input);
  const [rows, total] = await Promise.all([
    db
      .select({
        id: properties.id,
        code: properties.propertyCode,
        title: properties.title,
        type: properties.propertyType,
        listingType: properties.listingType,
        status: properties.status,
        currency: properties.currency,
        city: properties.city,
        province: properties.province,
        developmentName: developments.name,
      })
      .from(properties)
      .leftJoin(developments, eq(properties.developmentId, developments.id))
      .where(where)
      .orderBy(desc(properties.createdAt))
      .limit(limit)
      .offset((input.page - 1) * limit),
    db.select({ value: count() }).from(properties).where(where),
  ]);

  const filteredIds = (await db.select({ id: properties.id }).from(properties).where(where)).map(
    (row) => row.id,
  );

  const counts = await grantedCountsForProperties(context, filteredIds);
  const empty = { visible: 0, available: 0, floors: 0 };
  const summary = filteredIds.reduce(
    (running, id) => {
      const held = counts.get(id) ?? empty;
      running.unitsAvailable += held.available;
      if (!held.visible) running.needUnits += 1;
      return running;
    },
    { unitsAvailable: 0, needUnits: 0 },
  );

  return {
    rows: rows.map((row) => ({
      ...row,
      granted: counts.get(row.id) ?? empty,
    })),
    summary: {
      properties: total[0]?.value ?? 0,
      unitsAvailable: summary.unitsAvailable,
      needUnits: summary.needUnits,
    },
    total: total[0]?.value ?? 0,
    page: input.page,
    pages: Math.max(1, Math.ceil((total[0]?.value ?? 0) / limit)),
  };
}

/**
 * One row per unit the user may see, under the list's filters; a property with no visible unit
 * still gets one row, so the export lists every property.
 */
/** Rows in one property export. */
export const PROPERTY_EXPORT_LIMIT = 20_000;

export async function exportPropertyUnits(input: PropertyListFilters) {
  const context = await requirePermission("properties.view");
  return (
    db
      .select({
        code: properties.propertyCode,
        title: properties.title,
        developmentName: developments.name,
        type: properties.propertyType,
        listingType: properties.listingType,
        status: properties.status,
        // Each unit's own price, else its unit type's: what it sells for.
        unitPrice: sql<string | null>`coalesce(${units.price}, ${unitTypes.price})`,
        currency: properties.currency,
        city: properties.city,
        province: properties.province,
        floorLabel: floors.label,
        unitCode: units.code,
        unitStatus: units.status,
      })
      .from(properties)
      .leftJoin(developments, eq(properties.developmentId, developments.id))
      .leftJoin(
        units,
        and(
          eq(units.propertyId, properties.id),
          grantedUnitsCondition(context, {
            propertyId: units.propertyId,
            floorId: units.floorId,
            unitId: units.id,
          }),
        ),
      )
      .leftJoin(floors, eq(units.floorId, floors.id))
      .leftJoin(unitTypes, eq(units.unitTypeId, unitTypes.id))
      .where(propertyListWhere(context, input))
      .orderBy(asc(properties.title), asc(floors.level), asc(units.code))
      // shortcut: capped at 20,000 unit rows; stream it if the inventory ever outgrows that.
      .limit(PROPERTY_EXPORT_LIMIT)
  );
}

async function grantedCountsForProperties(context: AuthorizationContext, propertyIds: string[]) {
  const counts = new Map<string, { visible: number; available: number; floors: number }>();
  if (!propertyIds.length) return counts;

  const [unitRows, floorRows] = await Promise.all([
    db
      .select({
        propertyId: units.propertyId,
        visible: count(),
        available: sql<number>`count(*) filter (where ${eq(units.status, "available")})`.mapWith(
          Number,
        ),
      })
      .from(units)
      .where(
        and(
          inArray(units.propertyId, propertyIds),
          grantedUnitsCondition(context, {
            propertyId: units.propertyId,
            floorId: units.floorId,
            unitId: units.id,
          }),
        ),
      )
      .groupBy(units.propertyId),
    db
      .select({ propertyId: floors.propertyId, floors: count() })
      .from(floors)
      .where(
        and(
          inArray(floors.propertyId, propertyIds),
          grantedFloorsCondition(context, {
            propertyId: floors.propertyId,
            floorId: floors.id,
          }),
        ),
      )
      .groupBy(floors.propertyId),
  ]);

  for (const row of unitRows)
    counts.set(row.propertyId, {
      visible: row.visible,
      available: row.available,
      floors: 0,
    });
  for (const row of floorRows) {
    const held = counts.get(row.propertyId);
    if (held) held.floors = row.floors;
    else
      counts.set(row.propertyId, {
        visible: 0,
        available: 0,
        floors: row.floors,
      });
  }
  return counts;
}

export async function getPropertyOptions() {
  const context = await requirePermission("properties.view");
  // Every development, not only Active ones: inventory is usually added while pre-selling,
  // and an edit must still show the development a property already belongs to.
  const developmentRows = await db
    .select({
      id: developments.id,
      name: developments.name,
      status: developments.status,
      addressLine1: developments.addressLine1,
      province: developments.province,
      city: developments.city,
      barangay: developments.barangay,
      postalCode: developments.postalCode,
    })
    .from(developments)
    .where(eq(developments.organizationId, context.organizationId))
    .orderBy(asc(developments.name));
  return { developments: developmentRows };
}

export async function getProperty(id: string) {
  const context = await requirePermission("properties.view");
  if (!(await canAccessResource(context, { type: "property", id }))) return null;
  const [record] = await db
    .select()
    .from(properties)
    .where(
      and(
        eq(properties.id, id),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  if (!record) return null;
  const [features, history] = await Promise.all([
    db
      .select({
        id: propertyFeatures.id,
        name: propertyFeatures.name,
        valueType: propertyFeatures.valueType,
        booleanValue: propertyFeatureValues.booleanValue,
        textValue: propertyFeatureValues.textValue,
        numberValue: propertyFeatureValues.numberValue,
      })
      .from(propertyFeatureValues)
      .innerJoin(propertyFeatures, eq(propertyFeatureValues.featureId, propertyFeatures.id))
      .where(eq(propertyFeatureValues.propertyId, id))
      .orderBy(asc(propertyFeatures.name)),
    db
      .select({
        id: propertyStatusHistory.id,
        fromStatus: propertyStatusHistory.fromStatus,
        toStatus: propertyStatusHistory.toStatus,
        note: propertyStatusHistory.note,
        changedAt: propertyStatusHistory.changedAt,
        changedByFirstName: users.firstName,
        changedByLastName: users.lastName,
      })
      .from(propertyStatusHistory)
      .leftJoin(users, eq(propertyStatusHistory.changedBy, users.id))
      .where(eq(propertyStatusHistory.propertyId, id))
      .orderBy(desc(propertyStatusHistory.changedAt)),
  ]);
  return { record, features, history };
}

/** Archived properties the person could restore. */
export async function listArchivedProperties(input: { page: number; search?: string }) {
  const context = await requirePermission("properties.delete");
  const limit = 25;
  const where = and(
    eq(properties.organizationId, context.organizationId),
    isNotNull(properties.deletedAt),
    input.search
      ? or(
          ilike(properties.title, `%${input.search}%`),
          ilike(properties.propertyCode, `%${input.search}%`),
          ilike(properties.city, `%${input.search}%`),
        )
      : undefined,
    propertyWriteScope(context),
  );
  const [rows, total] = await Promise.all([
    db
      .select({
        id: properties.id,
        code: properties.propertyCode,
        title: properties.title,
        type: properties.propertyType,
        city: properties.city,
        province: properties.province,
        archivedAt: properties.deletedAt,
      })
      .from(properties)
      .where(where)
      .orderBy(desc(properties.deletedAt))
      .limit(limit)
      .offset((input.page - 1) * limit),
    db.select({ value: count() }).from(properties).where(where),
  ]);
  const totalCount = total[0]?.value ?? 0;
  return { rows, total: totalCount, pages: Math.max(1, Math.ceil(totalCount / limit)) };
}
