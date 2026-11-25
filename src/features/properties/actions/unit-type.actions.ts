"use server";

import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { ActionErrorCode } from "@/lib/errors/action-error";
import { revalidateProperty } from "../lib/revalidate-property";
import { db } from "@/db";
import { auditLogs, properties, unitTypes, units } from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { hasPermission } from "@/lib/permissions/policy";
import { logError } from "@/lib/logger";
import { outOfScope } from "@/lib/errors";
import {
  type ActionResult,
  databaseFailure,
  failure,
  failureFrom,
  notFoundFailure,
  success,
  validationFailure,
  validationFailureFromZod,
} from "@/lib/types/action-result";
import { canWriteProperty } from "../queries/property-scope.queries";
import { changesMoney, pricesNeedPermission } from "../lib/price-changes";
import { designFacts, REPRICED_STATUSES } from "../lib/floor-layout";
import { unitDetailsSchema, unitTypeSchema } from "../schemas/floor-layout.schema";

const money = (value: number | null) => (value === null ? null : value.toFixed(2));

/** Adds a unit type with its design, or updates one when `id` is given. */
export async function saveUnitType(
  input: unknown,
): Promise<ActionResult<{ id: string; repriced: number }>> {
  const context = await requirePermission("properties.manage_units");
  const parsed = unitTypeSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const value = parsed.data;
  if (!(await canWriteProperty(context, value.propertyId))) return failure(outOfScope());

  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.id, value.propertyId),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  if (!property) return notFoundFailure("Property");

  // Amounts need "Manage prices"; without it a type can still be designed and renamed.
  if (!hasPermission(context, "properties.manage_prices")) {
    const [current] = value.id
      ? await db
          .select({
            price: unitTypes.price,
            reservationFee: unitTypes.reservationFee,
            monthlyAmortization: unitTypes.monthlyAmortization,
          })
          .from(unitTypes)
          .where(and(eq(unitTypes.id, value.id), eq(unitTypes.propertyId, property.id)))
          .limit(1)
      : [];
    if (
      changesMoney(current, {
        price: money(value.price),
        reservationFee: money(value.reservationFee),
        monthlyAmortization: money(value.monthlyAmortization),
      })
    )
      return failure(outOfScope(pricesNeedPermission));
  }

  // Size and bedrooms follow the design, so the plan and the numbers never disagree.
  const facts = designFacts(value.layout);
  const fields = {
    name: value.name,
    bedrooms: facts.bedrooms,
    floorArea: money(facts.floorArea),
    price: money(value.price),
    reservationFee: money(value.reservationFee),
    monthlyAmortization: money(value.monthlyAmortization),
    layout: value.layout,
    updatedAt: new Date(),
  };
  try {
    const saved = await db.transaction(async (tx) => {
      const [row] = value.id
        ? await tx
            .update(unitTypes)
            .set(fields)
            .where(and(eq(unitTypes.id, value.id), eq(unitTypes.propertyId, property.id)))
            .returning({ id: unitTypes.id })
        : await tx
            .insert(unitTypes)
            .values({ ...fields, propertyId: property.id })
            .returning({ id: unitTypes.id });
      if (!row) return null;
      // A type's price is the price of its units: those still on sale drop their own price and
      // follow it. Reserved and sold units keep the price they were sold at.
      const repriced =
        fields.price === null
          ? []
          : await tx
              .update(units)
              .set({ price: null })
              .where(
                and(
                  eq(units.unitTypeId, row.id),
                  eq(units.buildingId, property.id),
                  inArray(units.status, [...REPRICED_STATUSES]),
                ),
              )
              .returning({ id: units.id });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: value.id ? "update" : "create",
        entityType: "unit_type",
        entityId: row.id,
        newValues: {
          propertyId: property.id,
          name: fields.name,
          bedrooms: fields.bedrooms,
          floorArea: fields.floorArea,
          price: fields.price,
          unitsRepriced: repriced.length,
        },
      });
      return { id: row.id, repriced: repriced.length };
    });
    if (!saved) return notFoundFailure("Unit type");
    revalidateProperty(property.id);
    return success(saved);
  } catch (error) {
    if ((error as { cause?: { code?: string } })?.cause?.code === "23505")
      return validationFailure("This property already has a unit type with that name.");
    logError("Unit type save failed", error, { operation: "unit_type_save" });
    return databaseFailure("The unit type could not be saved.");
  }
}

/**
 * Removes a unit type nobody uses. While units use it, their price, size and place on the floor
 * plans depend on it, so removal is refused until they are removed or given another type.
 */
export async function deleteUnitType(id: string): Promise<ActionResult> {
  const context = await requirePermission("properties.manage_units");
  if (!z.uuid().safeParse(id).success) return notFoundFailure("Unit type");
  const [type] = await db
    .select({ id: unitTypes.id, propertyId: unitTypes.propertyId, name: unitTypes.name })
    .from(unitTypes)
    .innerJoin(properties, eq(unitTypes.propertyId, properties.id))
    .where(and(eq(unitTypes.id, id), eq(properties.organizationId, context.organizationId)))
    .limit(1);
  if (!type) return notFoundFailure("Unit type");
  if (!(await canWriteProperty(context, type.propertyId))) return failure(outOfScope());
  try {
    const outcome = await db.transaction(async (tx) => {
      // Locked so no floor can place a unit of this type while it is being removed.
      await tx
        .select({ id: unitTypes.id })
        .from(unitTypes)
        .where(eq(unitTypes.id, type.id))
        .for("update");
      const [used] = await tx
        .select({ value: count() })
        .from(units)
        .where(eq(units.unitTypeId, type.id));
      if (used && used.value > 0) return used.value;
      await tx.delete(unitTypes).where(eq(unitTypes.id, type.id));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "unit_type",
        entityId: type.id,
        oldValues: { name: type.name, propertyId: type.propertyId },
      });
      return 0;
    });
    if (outcome > 0)
      return failureFrom(
        ActionErrorCode.CONFLICT,
        `${outcome} ${outcome === 1 ? "unit uses" : "units use"} ${type.name}. Remove ${outcome === 1 ? "it" : "them"} in Design floor or give ${outcome === 1 ? "it" : "them"} another type first.`,
      );
    revalidateProperty(type.propertyId);
    return success();
  } catch (error) {
    logError("Unit type delete failed", error, { operation: "unit_type_delete" });
    return databaseFailure("The unit type could not be removed.");
  }
}

/** Sets a unit's type and its own size and price. */
export async function saveUnitDetails(input: unknown): Promise<ActionResult> {
  const context = await requirePermission("properties.manage_units");
  const parsed = unitDetailsSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const value = parsed.data;
  const [unit] = await db
    .select({
      id: units.id,
      propertyId: units.buildingId,
      unitTypeId: units.unitTypeId,
      floorArea: units.floorArea,
      price: units.price,
    })
    .from(units)
    .innerJoin(properties, eq(units.buildingId, properties.id))
    .where(
      and(
        eq(units.id, value.unitId),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  if (!unit) return notFoundFailure("Unit");
  if (!(await canWriteProperty(context, unit.propertyId))) return failure(outOfScope());
  if (value.unitTypeId) {
    const [type] = await db
      .select({ id: unitTypes.id })
      .from(unitTypes)
      .where(and(eq(unitTypes.id, value.unitTypeId), eq(unitTypes.propertyId, unit.propertyId)))
      .limit(1);
    if (!type) return validationFailure("Choose a unit type of this property.");
  }
  if (
    !hasPermission(context, "properties.manage_prices") &&
    changesMoney({ price: unit.price }, { price: money(value.price) })
  )
    return failure(outOfScope(pricesNeedPermission));

  const fields = {
    unitTypeId: value.unitTypeId,
    floorArea: money(value.floorArea),
    price: money(value.price),
  };
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(units)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(units.id, unit.id));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "unit",
        entityId: unit.id,
        oldValues: { unitTypeId: unit.unitTypeId, floorArea: unit.floorArea, price: unit.price },
        newValues: fields,
      });
    });
    revalidateProperty(unit.propertyId);
    return success();
  } catch (error) {
    logError("Unit details save failed", error, { operation: "unit_details_save" });
    return databaseFailure("The unit could not be saved.");
  }
}
