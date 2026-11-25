"use server";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { revalidateProperty } from "../lib/revalidate-property";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  floors,
  properties,
  propertyParkingSlots,
  unitTypes,
  units,
} from "@/db/schema";
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
import { canWriteProperty } from "../queries/property-scope.queries";
import {
  copiedCode,
  resolvePlacements,
  slotsByPosition,
  type FloorLayout,
} from "../lib/floor-layout";
import { slotTypeChange } from "../lib/parking-types";
import { legacyNumbering, nextFreeCode } from "../lib/unit-numbering";
import { removalBlocker } from "../lib/unit-removal";
import { nextSlotCode } from "../lib/parking-codes";
import { renameActivities } from "../lib/rename-activities";
import { parkingRemovalBlocker } from "../lib/parking-removal";
import { syncParkingCount } from "../lib/parking-sync";
import { saveFloorLayoutSchema } from "../schemas/floor-layout.schema";

class LayoutError extends Error {}

/**
 * Saves a floor's designed top view and makes its units match: placed units keep their unit,
 * new ones become units with the next free number, and units taken off the floor are removed.
 * The same layout can be copied to other floors, matching their units by number (303 -> 503).
 */
export async function saveFloorLayout(
  input: unknown,
): Promise<ActionResult<{ created: number; removed: number; floors: number }>> {
  const context = await requirePermission("properties.manage_units");
  const parsed = saveFloorLayoutSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const { floorId, layout, copyToFloorIds } = parsed.data;

  const [source] = await db
    .select({
      id: floors.id,
      propertyId: floors.buildingId,
      developmentId: properties.developmentId,
      numbering: properties.unitNumbering,
      parkingTypes: properties.parkingTypes,
    })
    .from(floors)
    .innerJoin(properties, eq(floors.buildingId, properties.id))
    .where(
      and(
        eq(floors.id, floorId),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  if (!source) return notFoundFailure("Floor");
  if (!(await canWriteProperty(context, source.propertyId))) return failure(outOfScope());

  const typeIds = [...new Set(layout.units.map((unit) => unit.typeId))];
  if (typeIds.length) {
    const found = await db
      .select({ id: unitTypes.id })
      .from(unitTypes)
      .where(and(inArray(unitTypes.id, typeIds), eq(unitTypes.propertyId, source.propertyId)));
    if (found.length !== typeIds.length)
      return validationFailure("A placed unit uses a type from another property.");
  }
  const numbering = source.numbering ?? legacyNumbering;

  try {
    const outcome = await db.transaction(async (tx) => {
      // One floor save per property at a time: slot identifiers are property-wide, so two saves
      // on different floors could otherwise both hand out the same next one.
      await tx
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.id, source.propertyId))
        .for("update");
      const floorIds = [floorId, ...copyToFloorIds.filter((id) => id !== floorId)];
      const targets = await tx
        .select({ id: floors.id, level: floors.level, label: floors.label, layout: floors.layout })
        .from(floors)
        .where(and(inArray(floors.id, floorIds), eq(floors.buildingId, source.propertyId)))
        .orderBy(asc(floors.level))
        .for("update");
      if (targets.length !== floorIds.length)
        throw new LayoutError("Choose floors of this property.");
      const sourceFloor = targets.find((floor) => floor.id === floorId)!;
      let created = 0;
      let removedCount = 0;
      /** The source floor's unit codes, to number the copies. */
      let sourceCodes = new Map<string, string>();

      // The source floor first, so its codes are known when copying.
      for (const floor of [sourceFloor, ...targets.filter((f) => f.id !== floorId)]) {
        const copying = floor.id !== floorId;
        const placements = layout.units.map((unit) => {
          if (!copying) return { id: unit.id, unitId: unit.unitId, code: unit.code ?? null };
          const code = sourceCodes.get(unit.id);
          return {
            id: unit.id,
            unitId: null,
            code: code ? copiedCode(code, sourceFloor.level, floor.level) : null,
          };
        });
        const floorUnits = await tx
          .select({ id: units.id, code: units.code })
          .from(units)
          .where(eq(units.floorId, floor.id))
          .orderBy(asc(units.code))
          .for("update");
        const resolved = resolvePlacements({
          placements,
          floorUnits,
          previouslyPlaced: (floor.layout?.units ?? []).flatMap((unit) =>
            unit.unitId ? [unit.unitId] : [],
          ),
          nextCode: (taken) => nextFreeCode(numbering, floor.level, taken),
        });
        if (resolved.full)
          throw new LayoutError(`Every unit identifier on ${floor.label} is used.`);

        if (resolved.removed.length) {
          const blocker = await removalBlocker(tx, resolved.removed);
          if (blocker) throw new LayoutError(blocker);
          const gone = floorUnits.filter((unit) => resolved.removed.includes(unit.id));
          // Removed before the new units go in, so a freed number can be used again.
          await tx.delete(units).where(inArray(units.id, resolved.removed));
          await tx.insert(activities).values(
            gone.map((unit) => ({
              organizationId: context.organizationId,
              actorUserId: context.userId,
              activityType: "unit.deleted",
              summary: `Unit ${unit.code} was removed from ${floor.label}'s layout.`,
              propertyId: source.propertyId,
              metadata: { unitId: unit.id, code: unit.code },
            })),
          );
          removedCount += gone.length;
        }

        const typeOf = new Map(layout.units.map((unit) => [unit.id, unit.typeId]));
        const fresh = resolved.assigned.filter((entry) => entry.unitId === null);
        const inserted = fresh.length
          ? await tx
              .insert(units)
              .values(
                fresh.map((entry) => ({
                  developmentId: source.developmentId,
                  buildingId: source.propertyId,
                  floorId: floor.id,
                  code: entry.code,
                  unitTypeId: typeOf.get(entry.placementId)!,
                })),
              )
              .returning({ id: units.id, code: units.code })
          : [];
        created += inserted.length;
        const idOfCode = new Map(inserted.map((unit) => [unit.code, unit.id]));
        const unitIdOf = new Map(
          resolved.assigned.map((entry) => [
            entry.placementId,
            entry.unitId ?? idOfCode.get(entry.code)!,
          ]),
        );

        // Names typed on the plan rename units that already exist. Two steps, through a
        // temporary code, so a renumbering that shifts or swaps codes never collides.
        const renames = copying
          ? []
          : layout.units.flatMap((unit) => {
              const current = resolved.assigned.find((entry) => entry.placementId === unit.id);
              return unit.code && current?.unitId && current.code !== unit.code
                ? [{ unitId: current.unitId, code: unit.code, from: current.code }]
                : [];
            });
        for (const rename of renames)
          await tx
            .update(units)
            .set({ code: `~${rename.unitId}` })
            .where(eq(units.id, rename.unitId));
        for (const rename of renames)
          await tx
            .update(units)
            .set({ code: rename.code, updatedAt: new Date() })
            .where(eq(units.id, rename.unitId));
        // Each rename shows in the unit's history, as a single rename does.
        if (renames.length)
          await tx.insert(activities).values(
            renameActivities(
              context,
              source.propertyId,
              renames.map(({ unitId, from, code }) => ({ unitId, from, to: code })),
            ),
          );

        // Existing units take the type they were placed as, one update per type.
        const byType = new Map<string, string[]>();
        for (const entry of resolved.assigned)
          if (entry.unitId) {
            const typeId = typeOf.get(entry.placementId)!;
            byType.set(typeId, [...(byType.get(typeId) ?? []), entry.unitId]);
          }
        for (const [typeId, ids] of byType)
          await tx
            .update(units)
            .set({ unitTypeId: typeId, updatedAt: new Date() })
            .where(inArray(units.id, ids));

        // Parking slots on the plan, resolved like units but numbered across the property.
        const propertySlots = await tx
          .select({
            id: propertyParkingSlots.id,
            code: propertyParkingSlots.code,
            floorId: propertyParkingSlots.floorId,
            status: propertyParkingSlots.status,
            parkingTypeId: propertyParkingSlots.parkingTypeId,
          })
          .from(propertyParkingSlots)
          .where(eq(propertyParkingSlots.buildingId, source.propertyId))
          .for("update");
        const floorSlots = propertySlots.filter((slot) => slot.floorId === floor.id);
        const otherCodes = propertySlots
          .filter((slot) => slot.floorId !== floor.id)
          .map((slot) => slot.code);
        // A copy takes over the floor's own slots by position instead of replacing them.
        const kept = copying
          ? slotsByPosition(
              layout.parking,
              (floor.layout?.parking ?? []).filter((spot) =>
                floorSlots.some((slot) => slot.id === spot.slotId),
              ),
            )
          : null;
        const slotsResolved = resolvePlacements({
          placements: layout.parking.map((slot) => ({
            id: slot.id,
            unitId: kept ? (kept.get(slot.id) ?? null) : slot.slotId,
            code: copying ? null : (slot.code ?? null),
          })),
          floorUnits: floorSlots,
          previouslyPlaced: (floor.layout?.parking ?? []).flatMap((slot) =>
            slot.slotId ? [slot.slotId] : [],
          ),
          nextCode: (taken) => nextSlotCode(numbering, floor.level, [...otherCodes, ...taken]),
        });
        if (slotsResolved.removed.length) {
          const blocker = await parkingRemovalBlocker(tx, slotsResolved.removed);
          if (blocker) throw new LayoutError(blocker);
          await tx
            .delete(propertyParkingSlots)
            .where(inArray(propertyParkingSlots.id, slotsResolved.removed));
        }
        const freshSlots = slotsResolved.assigned.filter((entry) => entry.unitId === null);
        const insertedSlots = freshSlots.length
          ? await tx
              .insert(propertyParkingSlots)
              .values(
                freshSlots.map((entry) => {
                  // A slot dragged in as a parking type starts with its price and fee.
                  const typeId = layout.parking.find(
                    (spot) => spot.id === entry.placementId,
                  )?.typeId;
                  const type = source.parkingTypes.find((option) => option.id === typeId);
                  return {
                    buildingId: source.propertyId,
                    floorId: floor.id,
                    code: entry.code,
                    parkingTypeId: type?.id ?? null,
                    price: type?.price ?? null,
                    reservationFee: type?.reservationFee ?? null,
                  };
                }),
              )
              .returning({ id: propertyParkingSlots.id, code: propertyParkingSlots.code })
          : [];
        const slotIdOfCode = new Map(insertedSlots.map((slot) => [slot.code, slot.id]));
        const slotIdOf = new Map(
          slotsResolved.assigned.map((entry) => [
            entry.placementId,
            entry.unitId ?? slotIdOfCode.get(entry.code)!,
          ]),
        );

        // Like units: two steps, so a renumbering that shifts or swaps codes never collides.
        const slotRenames = copying
          ? []
          : layout.parking.flatMap((slot) => {
              const current = slotsResolved.assigned.find((entry) => entry.placementId === slot.id);
              return slot.code && current?.unitId && current.code !== slot.code
                ? [{ slotId: current.unitId, code: slot.code }]
                : [];
            });
        for (const rename of slotRenames)
          await tx
            .update(propertyParkingSlots)
            .set({ code: `~${rename.slotId}` })
            .where(eq(propertyParkingSlots.id, rename.slotId));
        for (const rename of slotRenames)
          await tx
            .update(propertyParkingSlots)
            .set({ code: rename.code, updatedAt: new Date() })
            .where(eq(propertyParkingSlots.id, rename.slotId));

        // A slot given a parking type on the plan joins it; an available one takes its price and
        // fee too, while a reserved or sold slot keeps what it was sold at.
        if (!copying)
          for (const spot of layout.parking) {
            const slotId = slotsResolved.assigned.find(
              (entry) => entry.placementId === spot.id,
            )?.unitId;
            const slot = propertySlots.find((candidate) => candidate.id === slotId);
            const change = slot && slotTypeChange(slot, spot.typeId, source.parkingTypes);
            if (change)
              await tx
                .update(propertyParkingSlots)
                .set({ ...change, updatedAt: new Date() })
                .where(eq(propertyParkingSlots.id, slot.id));
          }

        // Typed names are applied now, so the saved plan doesn't carry them.
        const saved: FloorLayout = {
          ...layout,
          units: layout.units.flatMap((unit) =>
            unitIdOf.has(unit.id)
              ? [{ ...unit, unitId: unitIdOf.get(unit.id)!, code: undefined }]
              : [],
          ),
          parking: layout.parking.flatMap((slot) =>
            slotIdOf.has(slot.id)
              ? [{ ...slot, slotId: slotIdOf.get(slot.id)!, code: undefined }]
              : [],
          ),
        };
        // The floor's design now holds its parking, so the old separate parking design is done.
        await tx
          .update(floors)
          .set({ layout: saved, parkingLayout: null, updatedAt: new Date() })
          .where(eq(floors.id, floor.id));
        if (insertedSlots.length || slotsResolved.removed.length)
          await syncParkingCount(tx, source.propertyId);
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "update",
          entityType: "floor",
          entityId: floor.id,
          newValues: {
            layout: {
              units: saved.units.length,
              spaces: saved.spaces.length,
              parking: saved.parking?.length ?? 0,
            },
            createdUnits: inserted.map((unit) => unit.code),
            removedUnits: resolved.removed.length,
            createdParking: insertedSlots.map((slot) => slot.code),
            removedParking: slotsResolved.removed.length,
            copiedFrom: copying ? floorId : undefined,
          },
        });
        // Copies follow the source's identifiers after this save, renames typed on the plan included.
        if (!copying) {
          const typed = new Map(layout.units.map((unit) => [unit.id, unit.code]));
          sourceCodes = new Map(
            resolved.assigned.map((entry) => [
              entry.placementId,
              typed.get(entry.placementId) ?? entry.code,
            ]),
          );
        }
      }
      return { created, removed: removedCount, floors: targets.length };
    });
    revalidateProperty(source.propertyId);
    return success(outcome);
  } catch (error) {
    if (error instanceof LayoutError) return validationFailure(error.message);
    const cause = (error as { cause?: { code?: string; table?: string } })?.cause;
    if (cause?.code === "23505")
      return validationFailure(
        cause.table === "parking_slots"
          ? "Two parking slots would share an identifier. Rename one and try again."
          : "Two units on a floor would share an identifier. Rename one and try again.",
      );
    logError("Floor layout save failed", error, { operation: "floor_layout_save" });
    return databaseFailure("The floor layout could not be saved.");
  }
}
