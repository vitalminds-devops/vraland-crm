"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  floors,
  properties,
  propertyParkingSlots,
  units,
} from "@/db/schema";
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
import { canWriteProperty } from "../queries/property-scope.queries";
import { revalidateProperty } from "../lib/revalidate-property";
import { compareParkingCodes, slotRenames } from "../lib/parking-codes";
import { renameActivities } from "../lib/rename-activities";
import { floorRenames, legacyIdentifier } from "../lib/unit-identifier";

/**
 * Gives every floor's units and parking the property's identifier style, in their current order,
 * so the whole property reads the same (201, 202… on every floor; P1, P2… or P2A, P2B…). Units and
 * slots keep their reservations and bills.
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
        .select({ numbering: properties.unitIdentifier })
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
      const numbering = property.numbering ?? legacyIdentifier;
      const floorRows = await tx
        .select({ id: floors.id, level: floors.level, label: floors.label })
        .from(floors)
        .where(eq(floors.propertyId, propertyId));
      const unitRows = floorRows.length
        ? await tx
            .select({ id: units.id, code: units.identifier, floorId: units.floorId })
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
      // Parking by floor gets each floor's codes; across the property, P1, P2… floor by floor.
      const slotRows = await tx
        .select({
          id: propertyParkingSlots.id,
          code: propertyParkingSlots.identifier,
          floorId: propertyParkingSlots.floorId,
        })
        .from(propertyParkingSlots)
        .where(eq(propertyParkingSlots.propertyId, propertyId))
        .for("update");
      const levelOf = new Map(floorRows.map((floor) => [floor.id, floor.level]));
      const slotChanges =
        numbering.parking === "floor"
          ? floorRows.flatMap((floor) =>
              slotRenames(
                slotRows.filter((slot) => slot.floorId === floor.id),
                numbering,
                floor.level,
              ),
            )
          : slotRenames(
              [...slotRows].sort(
                (a, b) =>
                  (levelOf.get(a.floorId ?? "") ?? Infinity) -
                    (levelOf.get(b.floorId ?? "") ?? Infinity) ||
                  compareParkingCodes(a.code, b.code),
              ),
              numbering,
              null,
            );
      for (const rename of slotChanges)
        await tx
          .update(propertyParkingSlots)
          .set({ identifier: `~${rename.id}` })
          .where(eq(propertyParkingSlots.id, rename.id));
      for (const rename of slotChanges)
        await tx
          .update(propertyParkingSlots)
          .set({ identifier: rename.code, updatedAt: new Date() })
          .where(eq(propertyParkingSlots.id, rename.id));
      // Two steps, through a temporary code, so shifted or swapped identifiers never collide.
      for (const rename of renames)
        await tx
          .update(units)
          .set({ identifier: `~${rename.id}` })
          .where(eq(units.id, rename.id));
      for (const rename of renames)
        await tx
          .update(units)
          .set({ identifier: rename.code, updatedAt: new Date() })
          .where(eq(units.id, rename.id));
      const codeOf = new Map(unitRows.map((unit) => [unit.id, unit.code]));
      if (renames.length)
        await tx.insert(activities).values(
          renameActivities(
            context,
            propertyId,
            renames.map((rename) => ({
              unitId: rename.id,
              from: codeOf.get(rename.id) ?? "",
              to: rename.code,
            })),
          ),
        );
      if (renames.length || slotChanges.length)
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "update",
          entityType: "property",
          entityId: propertyId,
          newValues: {
            unitIdentifiers: numbering.style,
            renamed: renames.length,
            parkingRenamed: slotChanges.length,
            skipped,
          },
        });
      return { renamed: renames.length, skipped };
    });
    if (!outcome) return notFoundFailure("Property");
    revalidateProperty(propertyId);
    return success(outcome);
  } catch (error) {
    logError("Unit identifier update failed", error, { operation: "unit_identifiers_all" });
    return databaseFailure("Couldn't update unit identifiers.");
  }
}
