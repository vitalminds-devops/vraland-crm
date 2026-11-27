import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { developments, floors, properties, units } from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import {
  grantedFloorsCondition,
  grantedPropertyCondition,
  grantedUnitsCondition,
} from "@/lib/permissions/property-access";

export async function listDevelopments(input: { page: number; search?: string; status?: string }) {
  const context = await requirePermission("developments.view");
  const limit = 18;
  const where = and(
    eq(developments.organizationId, context.organizationId),
    input.status ? eq(developments.status, input.status) : undefined,
    input.search
      ? or(
          ilike(developments.name, `%${input.search}%`),
          ilike(developments.code, `%${input.search}%`),
          ilike(developments.city, `%${input.search}%`),
          ilike(developments.province, `%${input.search}%`),
        )
      : undefined,
  );
  const [rows, total] = await Promise.all([
    db
      .select({
        id: developments.id,
        code: developments.code,
        name: developments.name,
        status: developments.status,
        city: developments.city,
        province: developments.province,
        launchDate: developments.launchDate,
        completionDate: developments.completionDate,
        coverImageStorageKey: developments.coverImageStorageKey,
      })
      .from(developments)
      .where(where)
      .orderBy(desc(developments.createdAt))
      .limit(limit)
      .offset((input.page - 1) * limit),
    db.select({ value: count() }).from(developments).where(where),
  ]);

  const names = rows.length
    ? await db
        .select({
          developmentId: properties.developmentId,
          title: properties.title,
        })
        .from(properties)
        .where(
          and(
            eq(properties.organizationId, context.organizationId),
            isNull(properties.deletedAt),
            grantedPropertyCondition(context, { propertyId: properties.id }),
            inArray(
              properties.developmentId,
              rows.map((row) => row.id),
            ),
          ),
        )
        .orderBy(asc(properties.title))
    : [];

  return {
    rows: rows.map((row) => ({
      ...row,
      propertyNames: names
        .filter((name) => name.developmentId === row.id)
        .map((name) => name.title),
    })),
    total: total[0]?.value ?? 0,
    page: input.page,
    pages: Math.max(1, Math.ceil((total[0]?.value ?? 0) / limit)),
  };
}

export async function getDevelopment(id: string) {
  const context = await requirePermission("developments.view");
  const [record] = await db
    .select()
    .from(developments)
    .where(and(eq(developments.id, id), eq(developments.organizationId, context.organizationId)))
    .limit(1);
  if (!record) return null;

  const buildings = await db
    .select({
      id: properties.id,
      code: properties.propertyCode,
      title: properties.title,
      propertyType: properties.propertyType,
      status: properties.status,
      addressLine1: properties.addressLine1,
      city: properties.city,
      floorCount: properties.floorCount,
      unitsPerFloor: properties.unitsPerFloor,
      unitIdentifierStyle: properties.unitIdentifierStyle,
    })
    .from(properties)
    .where(
      and(
        eq(properties.developmentId, id),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
        grantedPropertyCondition(context, { propertyId: properties.id }),
      ),
    )
    .orderBy(asc(properties.title));

  const buildingIds = buildings.map((building) => building.id);
  const [floorRows, unitRows] = buildingIds.length
    ? await Promise.all([
        db
          .select({
            id: floors.id,
            propertyId: floors.propertyId,
            level: floors.level,
            label: floors.label,
          })
          .from(floors)
          .where(
            and(
              inArray(floors.propertyId, buildingIds),
              grantedFloorsCondition(context, {
                propertyId: floors.propertyId,
                floorId: floors.id,
              }),
            ),
          )
          .orderBy(asc(floors.level)),
        db
          .select({
            id: units.id,
            propertyId: units.propertyId,
            floorId: units.floorId,
            code: units.identifier,
            status: units.status,
          })
          .from(units)
          .innerJoin(floors, eq(units.floorId, floors.id))
          .where(
            and(
              inArray(units.propertyId, buildingIds),
              grantedUnitsCondition(context, {
                propertyId: units.propertyId,
                floorId: units.floorId,
                unitId: units.id,
              }),
            ),
          )
          .orderBy(asc(floors.level), asc(units.identifier)),
      ])
    : [[], []];

  return {
    record,
    buildings: buildings.map((building) => ({
      ...building,
      floors: floorRows
        .filter((floor) => floor.propertyId === building.id)
        .map((floor) => ({
          ...floor,
          units: unitRows.filter((unit) => unit.floorId === floor.id),
        })),
    })),
    unitCount: unitRows.length,
  };
}

export async function getDevelopmentCoverImageRecord(developmentId: string) {
  const context = await requirePermission("developments.view");
  const [row] = await db
    .select({
      id: developments.id,
      storageKey: developments.coverImageStorageKey,
      mimeType: developments.coverImageMimeType,
    })
    .from(developments)
    .where(
      and(
        eq(developments.id, developmentId),
        eq(developments.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}
