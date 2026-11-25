"use server";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { outOfScope } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requirePermission } from "@/lib/permissions/authorization";
import {
  databaseFailure,
  failure,
  success,
  validationFailureFromZod,
  type ActionResult,
} from "@/lib/types/action-result";
import { createFloors, HasFloorsError } from "../lib/floor-setup";
import { canWriteProperty } from "../queries/property-scope.queries";
import { revalidateProperty } from "../lib/revalidate-property";
import { floorSetupSchema } from "../schemas/floor-setup.schema";

/** Builds a new property's floors from the Design page, once, before any floor exists. */
export async function setUpFloors(propertyId: string, input: unknown): Promise<ActionResult> {
  const context = await requirePermission("properties.manage_units");
  if (!(await canWriteProperty(context, propertyId))) return failure(outOfScope());
  const parsed = floorSetupSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);

  try {
    await db.transaction(async (tx) => {
      const levels = await createFloors(tx, propertyId, parsed.data);
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "floor",
        entityId: propertyId,
        newValues: { propertyId, floors: levels, numbering: parsed.data.style },
      });
    });
    revalidateProperty(propertyId);
    return success();
  } catch (error) {
    if (error instanceof HasFloorsError)
      return databaseFailure("This property already has floors.");
    logError("Floor setup failed", error, { operation: "floor_setup", propertyId });
    return databaseFailure("Floors could not be added.");
  }
}
