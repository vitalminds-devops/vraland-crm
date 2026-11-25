"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, floors, properties, units } from "@/db/schema";
import { outOfScope } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requirePermission } from "@/lib/permissions/authorization";
import {
  type ActionResult,
  databaseFailure,
  failure,
  notFoundFailure,
  success,
} from "@/lib/types/action-result";
import { canWriteProperty } from "../lib/property-scope";
import { revalidateProperty } from "../lib/revalidate-property";
import { floorRenames, legacyNumbering } from "../lib/unit-numbering";

/**
 * Gives every floor's units the property's identifier style, in their current order, so the whole
 * property reads the same (201, 202… on every floor). Units keep their reservations and bills.
 */
export async function applyIdentifiersToAllFloors(
  propertyId: string,
): Promise<ActionResult<{ renamed: number; skipped: string[] }>> {
  const context = await requirePermission("properties.manage_units");
  if (!z.uuid().safeParse(propertyId).success) return notFoundFailure("Property");
  if (!(await canWriteProperty(context, propertyId))) return failure(outOfScope());

  try {
    const outcome = await db.transaction(async (tx) => {
      const [property] = await tx
        .select({ numbering: properties.unitNumbering })
        .from(properties)
        .where(
          and(
            eq(properties.id, propertyId),
            eq(properties.organizationId, context.organizationId),
            isNull(properties.deletedAt),
          ),
        )
        .for("update");
      if (!property) return null;
      const numbering = property.numbering ?? legacyNumbering;
      const floorRows = await tx
        .select({ id: floors.id, level: floors.level, label: floors.label })
        .from(floors)
        .where(eq(floors.buildingId, propertyId));
      const unitRows = floorRows.length
        ? await tx
            .select({ id: units.id, code: units.code, floorId: units.floorId })
            .from(units)
            .where(
              inArray(
                units.floorId,
                floorRows.map((floor) => floor.id),
              ),
            )
            .for("update")
        : [];
      const renames: { id: string; code: string }[] = [];
      const skipped: string[] = [];
      for (const floor of floorRows) {
        const planned = floorRenames(
          unitRows.filter((unit) => unit.floorId === floor.id),
          numbering,
          floor.level,
        );
        if (planned) renames.push(...planned);
        else skipped.push(floor.label);
      }
      // Two steps, through a temporary code, so shifted or swapped identifiers never collide.
      for (const rename of renames)
        await tx
          .update(units)
          .set({ code: `~${rename.id}` })
          .where(eq(units.id, rename.id));
      for (const rename of renames)
        await tx
          .update(units)
          .set({ code: rename.code, updatedAt: new Date() })
          .where(eq(units.id, rename.id));
      if (renames.length)
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "update",
          entityType: "property",
          entityId: propertyId,
          newValues: { unitIdentifiers: numbering.style, renamed: renames.length, skipped },
        });
      return { renamed: renames.length, skipped };
    });
    if (!outcome) return notFoundFailure("Property");
    revalidateProperty(propertyId);
    return success(outcome);
  } catch (error) {
    logError("Unit identifier update failed", error, { operation: "unit_identifiers_all" });
    return databaseFailure("Unit identifiers could not be updated.");
  }
}
