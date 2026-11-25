"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, floors, properties } from "@/db/schema";
import { outOfScope } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requirePermission } from "@/lib/permissions/authorization";
import {
  type ActionResult,
  databaseFailure,
  failure,
  notFoundFailure,
  success,
  validationFailureFromZod,
} from "@/lib/types/action-result";
import { canWriteProperty } from "../lib/property-scope";
import { revalidateProperty } from "../lib/revalidate-property";
import { legacyNumbering } from "../lib/unit-numbering";
import { unitNamingSchema } from "../schemas/unit-naming.schema";

/**
 * Saves how a property names its units: the numbering for units placed from now on, and the
 * floor groups (name, colour, floors). Units already numbered keep their codes.
 */
export async function saveUnitNaming(input: unknown): Promise<ActionResult> {
  const context = await requirePermission("properties.manage_units");
  const parsed = unitNamingSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const value = parsed.data;
  if (!(await canWriteProperty(context, value.propertyId))) return failure(outOfScope());

  try {
    const saved = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          unitNumbering: properties.unitNumbering,
          floorGroups: properties.floorGroups,
        })
        .from(properties)
        .where(
          and(
            eq(properties.id, value.propertyId),
            eq(properties.organizationId, context.organizationId),
            isNull(properties.deletedAt),
          ),
        )
        .for("update");
      if (!current) return false;
      // Groups hold only this property's own floors; a floor removed since is dropped, not refused.
      const floorIds = (value.floorGroups ?? []).flatMap((group) => group.floorIds);
      const own = new Set(
        floorIds.length
          ? (
              await tx
                .select({ id: floors.id })
                .from(floors)
                .where(and(eq(floors.buildingId, value.propertyId), inArray(floors.id, floorIds)))
            ).map((floor) => floor.id)
          : [],
      );
      const floorGroups = value.floorGroups
        ?.map((group) => ({ ...group, floorIds: group.floorIds.filter((id) => own.has(id)) }))
        .filter((group) => group.floorIds.length > 0);
      // Skipped floors and units per floor stay as they were; only the naming changes.
      const numbering = value.style
        ? {
            ...(current.unitNumbering ?? legacyNumbering),
            style: value.style,
            endings: value.style === "custom" ? value.endings : [],
          }
        : current.unitNumbering;
      await tx
        .update(properties)
        .set({
          unitNumbering: numbering,
          floorGroups: floorGroups ?? current.floorGroups,
          updatedAt: new Date(),
        })
        .where(eq(properties.id, value.propertyId));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "property",
        entityId: value.propertyId,
        oldValues: {
          unitNumbering: current.unitNumbering,
          floorGroups: current.floorGroups,
        },
        newValues: {
          unitNumbering: numbering,
          floorGroups: floorGroups ?? current.floorGroups,
        },
      });
      return true;
    });
    if (!saved) return notFoundFailure("Property");
    revalidateProperty(value.propertyId);
    return success();
  } catch (error) {
    logError("Unit naming save failed", error, { operation: "unit_naming_save" });
    return databaseFailure("Unit naming could not be saved.");
  }
}
