"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, properties, propertyParkingSlots } from "@/db/schema";
import { outOfScope } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requirePermission } from "@/lib/permissions/authorization";
import {
  type ActionResult,
  databaseFailure,
  failure,
  notFoundFailure,
  success,
  validationFailure,
  validationFailureFromZod,
} from "@/lib/types/action-result";
import { changesMoney, heldPriceMessage } from "../lib/price-changes";
import { canWriteProperty } from "../queries/property-scope.queries";
import { revalidateProperty } from "../lib/revalidate-property";
import { slotPricesSchema } from "../schemas/property-prices.schema";

const amount = (value: number | null) => (value === null ? null : String(value));

/** Sets one parking slot's price and reservation fee. */
export async function saveSlotPrices(input: unknown): Promise<ActionResult> {
  const context = await requirePermission("properties.manage_prices");
  const parsed = slotPricesSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const value = parsed.data;
  const next = { price: amount(value.price), reservationFee: amount(value.reservationFee) };

  try {
    const [slot] = await db
      .select({
        propertyId: propertyParkingSlots.buildingId,
        code: propertyParkingSlots.code,
        price: propertyParkingSlots.price,
        reservationFee: propertyParkingSlots.reservationFee,
        reservedDealId: propertyParkingSlots.reservedDealId,
      })
      .from(propertyParkingSlots)
      .innerJoin(properties, eq(propertyParkingSlots.buildingId, properties.id))
      .where(
        and(
          eq(propertyParkingSlots.id, value.slotId),
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
        ),
      )
      .limit(1);
    if (!slot) return notFoundFailure("Parking slot");
    if (!(await canWriteProperty(context, slot.propertyId))) return failure(outOfScope());
    if (slot.reservedDealId && changesMoney({ price: slot.price }, { price: next.price }))
      return validationFailure(heldPriceMessage(`Parking ${slot.code}`));
    await db.transaction(async (tx) => {
      await tx
        .update(propertyParkingSlots)
        .set({ ...next, updatedAt: new Date() })
        .where(eq(propertyParkingSlots.id, value.slotId));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "parking_slot",
        entityId: value.slotId,
        oldValues: { price: slot.price, reservationFee: slot.reservationFee },
        newValues: next,
      });
    });
    revalidateProperty(slot.propertyId);
    return success();
  } catch (error) {
    logError("Parking slot prices save failed", error, { operation: "slot_prices_save" });
    return databaseFailure("Prices could not be saved.");
  }
}
