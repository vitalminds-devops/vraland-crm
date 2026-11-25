"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidateProperty } from "../lib/revalidate-property";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, floors, properties, propertyParkingSlots } from "@/db/schema";
import { logError } from "@/lib/logger";
import { requirePermission } from "@/lib/permissions/authorization";
import { activeHold, heldMessage, InventoryHeldError } from "../lib/inventory-hold";
import { canWriteProperty } from "../queries/property-scope.queries";
import { unitStatuses } from "../lib/unit-codes";
import { nextSlotCode } from "../lib/parking-codes";
import { legacyNumbering } from "../lib/unit-numbering";
import { placeOnDesignedFloor, syncParkingCount } from "../lib/parking-sync";
import { parkingRemovalBlocker } from "../lib/parking-removal";
import { dropFromFloorPlans } from "../lib/floor-plan-cleanup";

export type ParkingActionResult = { success: boolean; message: string };

const slotCode = z
  .string()
  .trim()
  .min(1, "Enter a slot name.")
  .max(50, "Keep the name under 50 characters.");

function failed(error: unknown): ParkingActionResult {
  logError("Parking slot write failed", error, { operation: "parking_write" });
  return { success: false, message: "Parking could not be saved because of a database error." };
}

/** The slot and its property, when the caller may change it. */
async function loadWritableSlot(slotId: string) {
  const context = await requirePermission("properties.manage_units");
  if (!z.uuid().safeParse(slotId).success) return { context, slot: null };
  const [slot] = await db
    .select({
      id: propertyParkingSlots.id,
      code: propertyParkingSlots.code,
      status: propertyParkingSlots.status,
      floorId: propertyParkingSlots.floorId,
      buildingId: propertyParkingSlots.buildingId,
    })
    .from(propertyParkingSlots)
    .innerJoin(properties, eq(propertyParkingSlots.buildingId, properties.id))
    .where(
      and(
        eq(propertyParkingSlots.id, slotId),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  if (!slot || !(await canWriteProperty(context, slot.buildingId))) return { context, slot: null };
  return { context, slot };
}

/** Adds the next free slot (P1, P2… or by floor, P2A…), on `floorId` when one is given. */
export async function addParkingSlot(
  propertyId: string,
  floorId: string | null = null,
  count = 1,
): Promise<ParkingActionResult> {
  const context = await requirePermission("properties.manage_units");
  if (!z.uuid().safeParse(propertyId).success || !(await canWriteProperty(context, propertyId)))
    return { success: false, message: "Property not found." };
  if (!z.number().int().min(1).max(100).safeParse(count).success)
    return { success: false, message: "Enter between 1 and 100." };
  let level: number | null = null;
  if (floorId !== null) {
    const [floor] = z.uuid().safeParse(floorId).success
      ? await db
          .select({ id: floors.id, level: floors.level })
          .from(floors)
          .where(and(eq(floors.id, floorId), eq(floors.buildingId, propertyId)))
          .limit(1)
      : [];
    if (!floor) return { success: false, message: "That floor is not on this property." };
    level = floor.level;
  }

  try {
    const code = await db.transaction(async (tx) => {
      const taken = (
        await tx
          .select({ code: propertyParkingSlots.code })
          .from(propertyParkingSlots)
          .where(eq(propertyParkingSlots.buildingId, propertyId))
      ).map((slot) => slot.code);
      const [property] = await tx
        .select({ numbering: properties.unitNumbering })
        .from(properties)
        .where(eq(properties.id, propertyId));
      const numbering = property?.numbering ?? legacyNumbering;
      let next = "";
      const added: string[] = [];
      for (let made = 0; made < count; made += 1) {
        next = nextSlotCode(numbering, level, taken);
        taken.push(next);
        const [slot] = await tx
          .insert(propertyParkingSlots)
          .values({ buildingId: propertyId, floorId, code: next })
          .returning({ id: propertyParkingSlots.id });
        added.push(slot.id);
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "create",
          entityType: "parking_slot",
          entityId: slot.id,
          newValues: { propertyId, floorId, code: next },
        });
      }
      await placeOnDesignedFloor(tx, floorId, added);
      await syncParkingCount(tx, propertyId);
      return next;
    });
    revalidateProperty(propertyId);
    return {
      success: true,
      message: count === 1 ? `Parking ${code} added.` : `${count} parking slots added.`,
    };
  } catch (error) {
    return failed(error);
  }
}

export async function setParkingSlotStatus(
  slotId: string,
  status: string,
): Promise<ParkingActionResult> {
  const parsed = z.enum(unitStatuses).safeParse(status);
  if (!parsed.success) return { success: false, message: "Invalid status." };
  const { context, slot } = await loadWritableSlot(slotId);
  if (!slot) return { success: false, message: "Parking slot not found." };

  try {
    await db.transaction(async (tx) => {
      // Locked so a deal cannot take the slot between this check and the update.
      const [locked] = await tx
        .select({ reservedDealId: propertyParkingSlots.reservedDealId })
        .from(propertyParkingSlots)
        .where(eq(propertyParkingSlots.id, slot.id))
        .for("update");
      const hold = await activeHold(tx, locked?.reservedDealId ?? null);
      if (hold) throw new InventoryHeldError(heldMessage(`Parking ${slot.code}`, hold.code));
      await tx
        .update(propertyParkingSlots)
        .set({
          status: parsed.data,
          // Only a stale hold from a closed opportunity reaches here; a hand change drops it.
          reservedDealId: null,
          updatedAt: new Date(),
        })
        .where(eq(propertyParkingSlots.id, slot.id));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "parking_slot",
        entityId: slot.id,
        oldValues: { status: slot.status },
        newValues: { status: parsed.data },
      });
    });
    revalidateProperty(slot.buildingId);
    return { success: true, message: `Parking ${slot.code} updated.` };
  } catch (error) {
    if (error instanceof InventoryHeldError) return { success: false, message: error.message };
    return failed(error);
  }
}

export async function renameParkingSlot(
  slotId: string,
  code: string,
): Promise<ParkingActionResult> {
  const parsed = slotCode.safeParse(code);
  if (!parsed.success)
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid name." };
  const { context, slot } = await loadWritableSlot(slotId);
  if (!slot) return { success: false, message: "Parking slot not found." };
  const next = parsed.data;
  if (next === slot.code) return { success: true, message: "No change." };

  const [taken] = await db
    .select({ id: propertyParkingSlots.id })
    .from(propertyParkingSlots)
    .where(
      and(
        eq(propertyParkingSlots.buildingId, slot.buildingId),
        eq(propertyParkingSlots.code, next),
      ),
    )
    .limit(1);
  if (taken) return { success: false, message: `Parking ${next} already exists.` };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(propertyParkingSlots)
        .set({ code: next, updatedAt: new Date() })
        .where(eq(propertyParkingSlots.id, slot.id));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "parking_slot",
        entityId: slot.id,
        oldValues: { code: slot.code },
        newValues: { code: next },
      });
    });
    revalidateProperty(slot.buildingId);
    return { success: true, message: `Parking renamed to ${next}.` };
  } catch (error) {
    return failed(error);
  }
}

/** Assigns a slot to one of its property's floors, or clears it with `null`. */
export async function assignParkingSlotFloor(
  slotId: string,
  floorId: string | null,
): Promise<ParkingActionResult> {
  if (floorId !== null && !z.uuid().safeParse(floorId).success)
    return { success: false, message: "Choose a floor." };
  const { context, slot } = await loadWritableSlot(slotId);
  if (!slot) return { success: false, message: "Parking slot not found." };
  if (floorId === slot.floorId) return { success: true, message: "No change." };

  let floorLabel: string | null = null;
  if (floorId) {
    const [floor] = await db
      .select({ label: floors.label })
      .from(floors)
      .where(and(eq(floors.id, floorId), eq(floors.buildingId, slot.buildingId)))
      .limit(1);
    if (!floor) return { success: false, message: "That floor is not on this property." };
    floorLabel = floor.label;
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(propertyParkingSlots)
        .set({ floorId, updatedAt: new Date() })
        .where(eq(propertyParkingSlots.id, slot.id));
      await placeOnDesignedFloor(tx, floorId, [slot.id]);
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "parking_slot",
        entityId: slot.id,
        oldValues: { floorId: slot.floorId },
        newValues: { floorId },
      });
    });
    revalidateProperty(slot.buildingId);
    return {
      success: true,
      message: floorLabel
        ? `Parking ${slot.code} assigned to ${floorLabel}.`
        : `Parking ${slot.code} has no floor now.`,
    };
  } catch (error) {
    return failed(error);
  }
}

/** Removes a slot, unless it is reserved or sold. */
export async function deleteParkingSlot(slotId: string): Promise<ParkingActionResult> {
  const { context, slot } = await loadWritableSlot(slotId);
  if (!slot) return { success: false, message: "Parking slot not found." };
  try {
    const blocker = await db.transaction(async (tx) => {
      const blocked = await parkingRemovalBlocker(tx, [slot.id]);
      if (blocked) return blocked;
      await dropFromFloorPlans(tx, [slot.floorId], { slotIds: [slot.id] });
      await tx.delete(propertyParkingSlots).where(eq(propertyParkingSlots.id, slot.id));
      await syncParkingCount(tx, slot.buildingId);
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "parking_slot",
        entityId: slot.id,
        oldValues: { code: slot.code, status: slot.status },
      });
      return null;
    });
    if (blocker) return { success: false, message: blocker };
    revalidateProperty(slot.buildingId);
    return { success: true, message: `Parking ${slot.code} removed.` };
  } catch (error) {
    return failed(error);
  }
}
