"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, properties, parkingSlots } from "@/db/schema";
import { outOfScope } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requirePermission } from "@/lib/permissions/authorization";
import { hasPermission } from "@/lib/permissions/policy";
import {
  type ActionResult,
  databaseFailure,
  failure,
  notFoundFailure,
  success,
  validationFailureFromZod,
} from "@/lib/types/action-result";
import type { ParkingType } from "../lib/parking-types";
import { canWriteProperty } from "../queries/property-scope.queries";
import { changesMoney, pricesNeedPermission } from "../lib/price-changes";
import { revalidateProperty } from "../lib/revalidate-property";
import { parkingTypeSchema } from "../schemas/parking-type.schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const amount = (value: number | null) => (value === null ? null : String(value));
/** The same amount, with null alike and "350000" equal to "350000.00". */
const sameAmount = (a: string | null, b: string | null) =>
  (a === null ? null : Number(a)) === (b === null ? null : Number(b));

/** The property's parking types, row locked so two saves don't drop each other's change. */
async function lockTypes(tx: Tx, organizationId: string, propertyId: string) {
  const [row] = await tx
    .select({ parkingTypes: properties.parkingTypes })
    .from(properties)
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.organizationId, organizationId),
        isNull(properties.deletedAt),
      ),
    )
    .for("update");
  return row?.parkingTypes ?? null;
}

/**
 * Adds or changes a parking type. Its price and reservation fee go to its slots still available,
 * like a unit type's price; reserved and sold slots keep theirs.
 */
export async function saveParkingType(input: unknown): Promise<ActionResult<{ id: string }>> {
  const context = await requirePermission("properties.manage_units");
  const parsed = parkingTypeSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const { propertyId, ...value } = parsed.data;
  if (!(await canWriteProperty(context, propertyId))) return failure(outOfScope());
  const next: ParkingType = {
    id: value.id ?? crypto.randomUUID(),
    name: value.name,
    w: value.w,
    h: value.h,
    price: amount(value.price),
    reservationFee: amount(value.reservationFee),
  };

  try {
    const saved = await db.transaction(async (tx) => {
      const types = await lockTypes(tx, context.organizationId, propertyId);
      if (!types) return "missing" as const;
      const before = types.find((type) => type.id === next.id);
      if (value.id && !before) return "missing" as const;
      // Amounts need "Manage prices"; without it a type can still be renamed or resized.
      if (
        !hasPermission(context, "properties.manage_prices") &&
        changesMoney(before, { price: next.price, reservationFee: next.reservationFee })
      )
        return "prices" as const;
      await tx
        .update(properties)
        .set({
          parkingTypes: before
            ? types.map((type) => (type.id === next.id ? next : type))
            : [...types, next],
          updatedAt: new Date(),
        })
        .where(eq(properties.id, propertyId));
      // Its available slots follow a new price or fee, but only those still on the type's old
      // amount: a slot given its own price in the parking window keeps it.
      if (before)
        for (const [column, field] of [
          [parkingSlots.price, "price"],
          [parkingSlots.reservationFee, "reservationFee"],
        ] as const)
          if (!sameAmount(before[field], next[field]))
            await tx
              .update(parkingSlots)
              .set({ [field]: next[field], updatedAt: new Date() })
              .where(
                and(
                  eq(parkingSlots.propertyId, propertyId),
                  eq(parkingSlots.parkingTypeId, next.id),
                  eq(parkingSlots.status, "available"),
                  sql`${column} is not distinct from ${before[field]}::numeric`,
                ),
              );
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: before ? "update" : "create",
        entityType: "parking_type",
        entityId: propertyId,
        oldValues: before ?? null,
        newValues: next,
      });
      return "saved" as const;
    });
    if (saved === "missing") return notFoundFailure("Parking type");
    if (saved === "prices") return failure(outOfScope(pricesNeedPermission));
    revalidateProperty(propertyId);
    return success({ id: next.id });
  } catch (error) {
    logError("Parking type save failed", error, { operation: "parking_type_save" });
    return databaseFailure("Couldn't save the parking type.");
  }
}

/** Removes a parking type; its slots stay, with the prices they have. */
export async function deleteParkingType(propertyId: string, typeId: string): Promise<ActionResult> {
  const context = await requirePermission("properties.manage_units");
  if (!z.uuid().safeParse(propertyId).success || !typeId) return notFoundFailure("Parking type");
  if (!(await canWriteProperty(context, propertyId))) return failure(outOfScope());

  try {
    const removed = await db.transaction(async (tx) => {
      const types = await lockTypes(tx, context.organizationId, propertyId);
      const before = types?.find((type) => type.id === typeId);
      if (!types || !before) return false;
      await tx
        .update(properties)
        .set({ parkingTypes: types.filter((type) => type.id !== typeId), updatedAt: new Date() })
        .where(eq(properties.id, propertyId));
      await tx
        .update(parkingSlots)
        .set({ parkingTypeId: null, updatedAt: new Date() })
        .where(
          and(eq(parkingSlots.propertyId, propertyId), eq(parkingSlots.parkingTypeId, typeId)),
        );
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "parking_type",
        entityId: propertyId,
        oldValues: before,
      });
      return true;
    });
    if (!removed) return notFoundFailure("Parking type");
    revalidateProperty(propertyId);
    return success();
  } catch (error) {
    logError("Parking type delete failed", error, { operation: "parking_type_delete" });
    return databaseFailure("Couldn't remove the parking type.");
  }
}
