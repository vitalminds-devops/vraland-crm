"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activities, auditLogs, properties, propertyParkingSlots, units } from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { logError } from "@/lib/logger";
import { outOfScope } from "@/lib/errors";
import {
  type ActionResult,
  databaseFailure,
  failure,
  notFoundFailure,
  success,
  validationFailure,
  validationFailureFromZod,
} from "@/lib/types/action-result";
import { dropFromFloorPlans } from "../lib/floor-plan-cleanup";
import { parkingRemovalBlocker } from "../lib/parking-removal";
import { syncParkingCount } from "../lib/parking-sync";
import { canWriteProperty } from "../queries/property-scope.queries";
import { revalidateProperty } from "../lib/revalidate-property";
import { removalBlocker } from "../lib/unit-removal";

const bulkSchema = z.object({
  propertyId: z.uuid(),
  ids: z.array(z.uuid()).min(1, "Choose at least one.").max(500, "Choose at most 500 at once."),
});

class Blocked extends Error {}

/** The property, when it is in the caller's organization and they may change it. */
async function writableProperty(
  context: Awaited<ReturnType<typeof requirePermission>>,
  propertyId: string,
) {
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  if (!property) return null;
  return (await canWriteProperty(context, property.id)) ? property : "out-of-scope";
}

/**
 * Removes several units at once. All or nothing: if any is reserved, sold or on an open
 * opportunity, none is removed and the message says which.
 */
export async function deleteUnits(input: unknown): Promise<ActionResult<{ removed: number }>> {
  const context = await requirePermission("properties.manage_units");
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const { propertyId, ids } = parsed.data;
  const property = await writableProperty(context, propertyId);
  if (!property) return notFoundFailure("Property");
  if (property === "out-of-scope") return failure(outOfScope());

  try {
    const removed = await db.transaction(async (tx) => {
      const targets = await tx
        .select({ id: units.id, code: units.code, status: units.status, floorId: units.floorId })
        .from(units)
        .where(and(inArray(units.id, ids), eq(units.buildingId, property.id)))
        .for("update");
      if (targets.length !== new Set(ids).size)
        throw new Blocked("Some of these units are not on this property.");
      const blocker = await removalBlocker(
        tx,
        targets.map((unit) => unit.id),
      );
      if (blocker) throw new Blocked(blocker);
      const targetIds = targets.map((unit) => unit.id);
      await dropFromFloorPlans(
        tx,
        targets.map((unit) => unit.floorId),
        { unitIds: targetIds },
      );
      await tx.delete(units).where(inArray(units.id, targetIds));
      await tx.insert(activities).values(
        targets.map((unit) => ({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          activityType: "unit.deleted",
          summary: `Unit ${unit.code} was removed.`,
          propertyId: property.id,
          metadata: { unitId: unit.id, code: unit.code },
        })),
      );
      await tx.insert(auditLogs).values(
        targets.map((unit) => ({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "delete",
          entityType: "unit",
          entityId: unit.id,
          oldValues: { code: unit.code, status: unit.status },
        })),
      );
      return targets.length;
    });
    revalidateProperty(property.id);
    return success({ removed });
  } catch (error) {
    if (error instanceof Blocked) return validationFailure(error.message);
    logError("Bulk unit removal failed", error, { operation: "units_bulk_delete" });
    return databaseFailure("Couldn't remove the units.");
  }
}

/**
 * Removes several parking slots at once. All or nothing: if any is reserved, sold or on an open
 * opportunity, none is removed and the message says which.
 */
export async function deleteParkingSlots(
  input: unknown,
): Promise<ActionResult<{ removed: number }>> {
  const context = await requirePermission("properties.manage_units");
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const { propertyId, ids } = parsed.data;
  const property = await writableProperty(context, propertyId);
  if (!property) return notFoundFailure("Property");
  if (property === "out-of-scope") return failure(outOfScope());

  try {
    const removed = await db.transaction(async (tx) => {
      const targets = await tx
        .select({
          id: propertyParkingSlots.id,
          code: propertyParkingSlots.code,
          status: propertyParkingSlots.status,
          floorId: propertyParkingSlots.floorId,
        })
        .from(propertyParkingSlots)
        .where(
          and(
            inArray(propertyParkingSlots.id, ids),
            eq(propertyParkingSlots.buildingId, property.id),
          ),
        )
        .for("update");
      if (targets.length !== new Set(ids).size)
        throw new Blocked("Some of these parking slots are not on this property.");
      const targetIds = targets.map((slot) => slot.id);
      const blocker = await parkingRemovalBlocker(tx, targetIds);
      if (blocker) throw new Blocked(blocker);
      await dropFromFloorPlans(
        tx,
        targets.map((slot) => slot.floorId),
        { slotIds: targetIds },
      );
      await tx.delete(propertyParkingSlots).where(inArray(propertyParkingSlots.id, targetIds));
      await syncParkingCount(tx, property.id);
      await tx.insert(auditLogs).values(
        targets.map((slot) => ({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "delete",
          entityType: "parking_slot",
          entityId: slot.id,
          oldValues: { code: slot.code, status: slot.status },
        })),
      );
      return targets.length;
    });
    revalidateProperty(property.id);
    return success({ removed });
  } catch (error) {
    if (error instanceof Blocked) return validationFailure(error.message);
    logError("Bulk parking removal failed", error, { operation: "parking_bulk_delete" });
    return databaseFailure("Couldn't remove the parking slots.");
  }
}
