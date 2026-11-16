"use server";

import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activities, auditLogs, deals, floors, properties, units } from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { logError } from "@/lib/logger";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { matchesDeclaredType } from "@/lib/storage/file-signature";
import { nextFloorLevel } from "../lib/floor-levels";
import { activeHold, heldMessage, InventoryHeldError } from "../lib/inventory-hold";
import { canWriteProperty } from "../lib/property-scope";
import { floorLabel, unitCode, unitStatuses } from "../lib/unit-codes";
import { ActionResult, failure, databaseFailure } from "@/lib/types/action-result";
import { outOfScope } from "@/lib/errors";

/**
 * Backward-compatible result type for unit actions.
 */
export type UnitActionResult =
  { success: true; message: string } | { success: false; message: string };

/**
 * Convert new ActionResult to legacy UnitActionResult for backward compatibility.
 */
function toLegacyResult(result: ActionResult<void>): UnitActionResult {
  if (result.success) {
    return { success: true, message: "Operation completed successfully." };
  }
  return {
    success: false,
    message: result.error.message,
  };
}

/**
 * Handle database errors with logging.
 */
function handleDatabaseError(error: unknown, what: string): ActionResult<void> {
  logError(`${what} write failed`, error, { operation: "unit_write" });
  const cause = error instanceof Error && error.cause ? error.cause : error;
  const detail =
    (cause as { detail?: string; message?: string })?.detail ||
    (cause as { message?: string })?.message;
  return databaseFailure(
    process.env.NODE_ENV === "development" && detail
      ? `${what} could not be saved: ${detail}`
      : `${what} could not be saved because of a database error.`,
    detail,
  );
}

const statusSchema = z.object({
  unitId: z.uuid(),
  status: z.enum(unitStatuses),
});

/** Move one unit between available, deposit paid, sold and inactive. */
export async function setUnitStatus(unitId: string, status: string): Promise<UnitActionResult> {
  const context = await requirePermission("properties.manage_units");
  const parsed = statusSchema.safeParse({ unitId, status });
  if (!parsed.success) return { success: false, message: "Invalid status." };

  const target = await loadUnit(context.organizationId, parsed.data.unitId);
  if (!target) return { success: false, message: "Unit not found." };
  if (!(await canWriteProperty(context, target.buildingId)))
    return toLegacyResult(failure(outOfScope()));

  try {
    await db.transaction(async (tx) => {
      // Locked so a deal cannot take the unit between this check and the update.
      const [locked] = await tx
        .select({ reservedDealId: units.reservedDealId })
        .from(units)
        .where(eq(units.id, target.id))
        .for("update");
      const hold = await activeHold(tx, locked?.reservedDealId ?? null);
      if (hold) throw new InventoryHeldError(heldMessage(`Unit ${target.code}`, hold.code));
      await tx
        .update(units)
        .set({
          status: parsed.data.status,
          // Only a stale hold from a closed opportunity reaches here; a hand change drops it.
          reservedDealId: null,
          updatedAt: new Date(),
        })
        .where(eq(units.id, target.id));
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "unit.status_changed",
        summary: `Unit ${target.code} is now ${parsed.data.status.replaceAll("_", " ")}.`,
        propertyId: target.buildingId,
        metadata: {
          unitId: target.id,
          code: target.code,
          from: target.status,
          to: parsed.data.status,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "unit",
        entityId: target.id,
        oldValues: { status: target.status },
        newValues: { status: parsed.data.status },
      });
    });
    revalidatePath(`/properties/${target.buildingId}`);
    return { success: true, message: `Unit ${target.code} updated.` };
  } catch (error) {
    if (error instanceof InventoryHeldError) return { success: false, message: error.message };
    return toLegacyResult(handleDatabaseError(error, "Unit"));
  }
}

/**
 * Why these units must stay, or null: a reserved or sold unit, or one an open deal is for,
 * is part of a sale, so removing it would lose that record.
 */
async function removalBlocker(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  unitIds: string[],
): Promise<string | null> {
  if (!unitIds.length) return null;
  const rows = await tx
    .select({
      code: units.code,
      status: units.status,
      reservedDealId: units.reservedDealId,
      dealCode: deals.dealCode,
    })
    .from(units)
    .leftJoin(
      deals,
      and(
        or(eq(deals.unitId, units.id), sql`${units.id} = any(${deals.unitIds})`),
        eq(deals.status, "open"),
        isNull(deals.deletedAt),
      ),
    )
    .where(inArray(units.id, unitIds))
    .orderBy(asc(units.id))
    .for("update", { of: units });
  const sold = rows.find(
    (row) => row.status === "deposit_paid" || row.status === "sold" || row.reservedDealId,
  );
  if (sold)
    return `Unit ${sold.code} is ${sold.status === "sold" ? "sold" : "reserved"}, so it cannot be removed. Mark it Available or Inactive first.`;
  const inDeal = rows.find((row) => row.dealCode);
  if (inDeal)
    return `Unit ${inDeal.code} is on open opportunity ${inDeal.dealCode}, so it cannot be removed.`;
  return null;
}

/** Keeps the property's saved floor count in step with its inventory. */
async function syncFloorCount(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  propertyId: string,
) {
  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(floors)
    .where(eq(floors.buildingId, propertyId));
  await tx
    .update(properties)
    .set({ floorCount: total || null, updatedAt: new Date() })
    .where(eq(properties.id, propertyId));
}

async function loadFloor(organizationId: string, floorId: string) {
  const [row] = await db
    .select({
      id: floors.id,
      level: floors.level,
      label: floors.label,
      buildingId: floors.buildingId,
      developmentId: properties.developmentId,
      propertyTitle: properties.title,
    })
    .from(floors)
    .innerJoin(properties, eq(floors.buildingId, properties.id))
    .where(
      and(
        eq(floors.id, floorId),
        eq(properties.organizationId, organizationId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

const addCountSchema = z.number().int().min(1).max(100);
const unitsEachSchema = z.number().int().min(0).max(100);

/**
 * Adds `count` floors above the top one (level 4 is skipped, as Generate does),
 * each with `unitsEach` units.
 */
export async function addFloor(
  propertyId: string,
  count = 1,
  unitsEach = 0,
): Promise<UnitActionResult> {
  const context = await requirePermission("properties.manage_units");
  if (!z.uuid().safeParse(propertyId).success)
    return { success: false, message: "Invalid property." };
  if (!addCountSchema.safeParse(count).success || !unitsEachSchema.safeParse(unitsEach).success)
    return { success: false, message: "Enter between 1 and 100." };
  if (!(await canWriteProperty(context, propertyId))) return toLegacyResult(failure(outOfScope()));
  const [property] = await db
    .select({
      id: properties.id,
      title: properties.title,
      developmentId: properties.developmentId,
    })
    .from(properties)
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  if (!property) return { success: false, message: "Property not found." };

  try {
    const label = await db.transaction(async (tx) => {
      const levels = (
        await tx
          .select({ level: floors.level })
          .from(floors)
          .where(eq(floors.buildingId, propertyId))
      ).map((floor) => floor.level);
      let label = "";
      for (let added = 0; added < count; added += 1) {
        const level = nextFloorLevel(levels);
        levels.push(level);
        const [floor] = await tx
          .insert(floors)
          .values({ buildingId: propertyId, level, label: floorLabel(level) })
          .returning({ id: floors.id, label: floors.label });
        label = floor.label;
        if (unitsEach)
          await tx.insert(units).values(
            Array.from({ length: unitsEach }, (_, index) => ({
              developmentId: property.developmentId,
              buildingId: propertyId,
              floorId: floor.id,
              code: unitCode(level, index + 1),
            })),
          );
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "create",
          entityType: "floor",
          entityId: floor.id,
          newValues: { propertyId, level, label: floor.label, units: unitsEach },
        });
      }
      await syncFloorCount(tx, propertyId);
      return label;
    });
    revalidatePath(`/properties/${propertyId}`);
    return { success: true, message: count === 1 ? `${label} added.` : `${count} floors added.` };
  } catch (error) {
    return toLegacyResult(handleDatabaseError(error, "Floor"));
  }
}

const floorNameSchema = z.object({
  floorId: z.uuid(),
  label: z
    .string()
    .trim()
    .min(1, "Enter a floor name.")
    .max(60, "Keep the name under 60 characters."),
});

/** Renames a floor; its level, and so its place in the building, stays the same. */
export async function renameFloor(floorId: string, label: string): Promise<UnitActionResult> {
  const context = await requirePermission("properties.manage_units");
  const parsed = floorNameSchema.safeParse({ floorId, label });
  if (!parsed.success)
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid name." };
  const floor = await loadFloor(context.organizationId, parsed.data.floorId);
  if (!floor) return { success: false, message: "Floor not found." };
  if (!(await canWriteProperty(context, floor.buildingId)))
    return toLegacyResult(failure(outOfScope()));
  const next = parsed.data.label;
  if (next === floor.label) return { success: true, message: "No change." };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(floors)
        .set({ label: next, updatedAt: new Date() })
        .where(eq(floors.id, floor.id));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "floor",
        entityId: floor.id,
        oldValues: { label: floor.label },
        newValues: { label: next },
      });
    });
    revalidatePath(`/properties/${floor.buildingId}`);
    return { success: true, message: `${floor.label} renamed to ${next}.` };
  } catch (error) {
    return toLegacyResult(handleDatabaseError(error, "Floor"));
  }
}

/** Removes a floor and its units, unless one of them is part of a sale. */
export async function deleteFloor(floorId: string): Promise<UnitActionResult> {
  const context = await requirePermission("properties.manage_units");
  if (!z.uuid().safeParse(floorId).success) return { success: false, message: "Invalid floor." };
  const floor = await loadFloor(context.organizationId, floorId);
  if (!floor) return { success: false, message: "Floor not found." };
  if (!(await canWriteProperty(context, floor.buildingId)))
    return toLegacyResult(failure(outOfScope()));

  try {
    const blocker = await db.transaction(async (tx) => {
      // Lock the floor before enumerating units so new units cannot race its removal.
      await tx.select({ id: floors.id }).from(floors).where(eq(floors.id, floor.id)).for("update");
      const onFloor = await tx
        .select({ id: units.id })
        .from(units)
        .where(eq(units.floorId, floor.id));
      const blocker = await removalBlocker(
        tx,
        onFloor.map((unit) => unit.id),
      );
      if (blocker) return blocker;
      // Units cascade with the floor.
      await tx.delete(floors).where(eq(floors.id, floor.id));
      await syncFloorCount(tx, floor.buildingId);
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "floor",
        entityId: floor.id,
        oldValues: {
          label: floor.label,
          level: floor.level,
          units: onFloor.length,
        },
      });
      return null;
    });
    if (blocker) return { success: false, message: blocker };
    revalidatePath(`/properties/${floor.buildingId}`);
    return { success: true, message: `${floor.label} removed.` };
  } catch (error) {
    return toLegacyResult(handleDatabaseError(error, "Floor"));
  }
}

/** Adds `count` units to a floor with the next free codes (1A, 1B, … after the last). */
export async function addUnit(floorId: string, count = 1): Promise<UnitActionResult> {
  const context = await requirePermission("properties.manage_units");
  if (!z.uuid().safeParse(floorId).success) return { success: false, message: "Invalid floor." };
  if (!addCountSchema.safeParse(count).success)
    return { success: false, message: "Enter between 1 and 100." };
  const floor = await loadFloor(context.organizationId, floorId);
  if (!floor) return { success: false, message: "Floor not found." };
  if (!(await canWriteProperty(context, floor.buildingId)))
    return toLegacyResult(failure(outOfScope()));

  try {
    const code = await db.transaction(async (tx) => {
      const taken = new Set(
        (await tx.select({ code: units.code }).from(units).where(eq(units.floorId, floor.id))).map(
          (unit) => unit.code,
        ),
      );
      let index = taken.size + 1;
      let next = "";
      for (let added = 0; added < count; added += 1) {
        while (taken.has(unitCode(floor.level, index))) index += 1;
        next = unitCode(floor.level, index);
        taken.add(next);
        const [unit] = await tx
          .insert(units)
          .values({
            developmentId: floor.developmentId,
            buildingId: floor.buildingId,
            floorId: floor.id,
            code: next,
          })
          .returning({ id: units.id });
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "create",
          entityType: "unit",
          entityId: unit.id,
          newValues: { code: next, floorId: floor.id },
        });
      }
      return next;
    });
    revalidatePath(`/properties/${floor.buildingId}`);
    return {
      success: true,
      message:
        count === 1
          ? `Unit ${code} added to ${floor.label}.`
          : `${count} units added to ${floor.label}.`,
    };
  } catch (error) {
    return toLegacyResult(handleDatabaseError(error, "Unit"));
  }
}

export async function deleteUnit(unitId: string): Promise<UnitActionResult> {
  const context = await requirePermission("properties.manage_units");
  const parsed = z.uuid().safeParse(unitId);
  if (!parsed.success) return { success: false, message: "Invalid unit." };

  const target = await loadUnit(context.organizationId, parsed.data);
  if (!target) return { success: false, message: "Unit not found." };
  if (!(await canWriteProperty(context, target.buildingId)))
    return toLegacyResult(failure(outOfScope()));
  try {
    const blocker = await db.transaction(async (tx) => {
      const blocker = await removalBlocker(tx, [target.id]);
      if (blocker) return blocker;
      await tx.delete(units).where(eq(units.id, target.id));
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "unit.deleted",
        summary: `Unit ${target.code} was removed.`,
        propertyId: target.buildingId,
        metadata: { unitId: target.id, code: target.code },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "unit",
        entityId: target.id,
        oldValues: { code: target.code, status: target.status },
      });
      return null;
    });
    if (blocker) return { success: false, message: blocker };
    revalidatePath(`/properties/${target.buildingId}`);
    return { success: true, message: `Unit ${target.code} removed.` };
  } catch (error) {
    return toLegacyResult(handleDatabaseError(error, "Unit"));
  }
}

const renameSchema = z.object({
  unitId: z.uuid(),
  code: z
    .string()
    .trim()
    .min(1, "Enter a unit name.")
    .max(50, "Keep the name under 50 characters."),
});

/** Renames a unit; names stay unique within their floor. */
export async function renameUnit(unitId: string, code: string): Promise<UnitActionResult> {
  const context = await requirePermission("properties.manage_units");
  const parsed = renameSchema.safeParse({ unitId, code });
  if (!parsed.success)
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid name." };

  const target = await loadUnit(context.organizationId, parsed.data.unitId);
  if (!target) return { success: false, message: "Unit not found." };
  if (!(await canWriteProperty(context, target.buildingId)))
    return toLegacyResult(failure(outOfScope()));
  const next = parsed.data.code;
  if (next === target.code) return { success: true, message: "No change." };

  const [taken] = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.floorId, target.floorId), eq(units.code, next)))
    .limit(1);
  if (taken) return { success: false, message: `Unit ${next} already exists on this floor.` };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(units)
        .set({ code: next, updatedAt: new Date() })
        .where(eq(units.id, target.id));
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "unit.renamed",
        summary: `Unit ${target.code} was renamed to ${next}.`,
        propertyId: target.buildingId,
        metadata: { unitId: target.id, from: target.code, to: next },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "unit",
        entityId: target.id,
        oldValues: { code: target.code },
        newValues: { code: next },
      });
    });
    revalidatePath(`/properties/${target.buildingId}`);
    return { success: true, message: `Unit renamed to ${next}.` };
  } catch (error) {
    return toLegacyResult(handleDatabaseError(error, "Unit"));
  }
}

async function loadUnit(organizationId: string, unitId: string) {
  const [row] = await db
    .select({
      id: units.id,
      code: units.code,
      status: units.status,
      floorId: units.floorId,
      buildingId: units.buildingId,
      propertyTitle: properties.title,
      imageStorageKey: units.imageStorageKey,
    })
    .from(units)
    .innerJoin(properties, eq(units.buildingId, properties.id))
    .where(
      and(
        eq(units.id, unitId),
        eq(properties.organizationId, organizationId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

const unitImageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const unitImageLimit = 5 * 1024 * 1024;

const unitIdSchema = z.uuid();

type UnitRow = {
  id: string;
  code: string;
  buildingId: string;
  propertyTitle: string;
  imageStorageKey: string | null;
};

async function loadUnitWithProperty(
  organizationId: string,
  unitId: string,
): Promise<UnitRow | null> {
  const [row] = await db
    .select({
      id: units.id,
      code: units.code,
      buildingId: properties.id,
      propertyTitle: properties.title,
      imageStorageKey: units.imageStorageKey,
    })
    .from(units)
    .innerJoin(properties, eq(units.buildingId, properties.id))
    .where(
      and(
        eq(units.id, unitId),
        eq(properties.organizationId, organizationId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

function writeUnitFailure(error: unknown): UnitActionResult {
  logError("Unit picture write failed", error, {
    operation: "unit_image_write",
  });
  return {
    success: false,
    message: "The unit picture could not be saved.",
  };
}

export async function saveUnitImage(formData: FormData): Promise<UnitActionResult> {
  const context = await requirePermission("properties.manage_unit_pictures");

  const parsed = unitIdSchema.safeParse(formData.get("unitId"));
  if (!parsed.success) return { success: false, message: "That unit could not be found." };

  const file = formData.get("image");
  if (!(file instanceof File) || !file.size)
    return { success: false, message: "Choose a picture to upload." };
  if (!unitImageTypes[file.type] || !(await matchesDeclaredType(file)))
    return {
      success: false,
      message: "Choose a JPEG, PNG or WebP image.",
    };
  if (file.size > unitImageLimit)
    return { success: false, message: "Pictures must be 5 MB or smaller." };

  const unit = await loadUnitWithProperty(context.organizationId, parsed.data);
  if (!unit) return { success: false, message: "That unit could not be found." };
  if (!(await canWriteProperty(context, unit.buildingId)))
    return {
      success: false,
      message: "You do not have permission to modify this property.",
    };

  const storageKey = `${context.organizationId}/units/${unit.id}/${randomUUID()}.${unitImageTypes[file.type]}`;
  const body = Buffer.from(await file.arrayBuffer());
  const storage = getDocumentStorage();

  try {
    await storage.put(storageKey, body);
  } catch (error) {
    return writeUnitFailure(error);
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(units)
        .set({
          imageStorageKey: storageKey,
          imageMimeType: file.type,
          updatedAt: new Date(),
        })
        .where(eq(units.id, unit.id));

      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: unit.imageStorageKey
          ? "property.unit_image_replaced"
          : "property.unit_image_added",
        summary: `Unit ${unit.code} of ${unit.propertyTitle} ${
          unit.imageStorageKey ? "was re-pictured" : "was given a picture"
        }.`,
        propertyId: unit.buildingId,
        metadata: { unitId: unit.id, mimeType: file.type, size: file.size },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "unit",
        entityId: unit.id,
        oldValues: { imageStorageKey: unit.imageStorageKey },
        newValues: { imageStorageKey: storageKey, mimeType: file.type },
      });
    });
  } catch (error) {
    await storage.remove(storageKey).catch((cleanupError) =>
      logError("Orphaned unit picture cleanup failed", cleanupError, {
        operation: "unit_image_cleanup",
        unitId: unit.id,
      }),
    );
    return writeUnitFailure(error);
  }

  if (unit.imageStorageKey)
    await storage.remove(unit.imageStorageKey).catch((error) =>
      logError("Replaced unit picture cleanup failed", error, {
        operation: "unit_image_cleanup",
        unitId: unit.id,
      }),
    );

  revalidatePath(`/properties/${unit.buildingId}`);
  return { success: true, message: `Unit ${unit.code} picture saved.` };
}

export async function removeUnitImage(unitId: string): Promise<UnitActionResult> {
  const context = await requirePermission("properties.manage_unit_pictures");

  const parsed = unitIdSchema.safeParse(unitId);
  if (!parsed.success) return { success: false, message: "That unit could not be found." };

  const unit = await loadUnitWithProperty(context.organizationId, parsed.data);
  if (!unit) return { success: false, message: "That unit could not be found." };
  if (!unit.imageStorageKey)
    return { success: false, message: "That unit has no picture to remove." };
  if (!(await canWriteProperty(context, unit.buildingId)))
    return {
      success: false,
      message: "You do not have permission to modify this property.",
    };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(units)
        .set({
          imageStorageKey: null,
          imageMimeType: null,
          updatedAt: new Date(),
        })
        .where(eq(units.id, unit.id));

      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "unit",
        entityId: unit.id,
        oldValues: { imageStorageKey: unit.imageStorageKey },
        newValues: { imageStorageKey: null },
      });
    });
  } catch (error) {
    return writeUnitFailure(error);
  }

  await getDocumentStorage()
    .remove(unit.imageStorageKey)
    .catch((error) =>
      logError("Removed unit picture cleanup failed", error, {
        operation: "unit_image_cleanup",
        unitId: unit.id,
      }),
    );

  revalidatePath(`/properties/${unit.buildingId}`);
  return { success: true, message: `Unit ${unit.code} picture removed.` };
}
