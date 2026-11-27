import "server-only";

import { and, asc, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import type { db } from "@/db";
import { activities, auditLogs, properties, propertyParkingSlots, units } from "@/db/schema";
import { isHeld } from "@/features/properties/lib/unit-codes";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type InventoryStatus = "available" | "deposit_paid" | "sold";
type InventoryRow = {
  id: string;
  propertyId: string;
  code: string;
  status: string;
  reservedDealId: string | null;
  propertyDeletedAt: Date | null;
};

export class InventoryUnavailable extends Error {}

/** "Unit 2A", "Parking P3": the deal's units and parking slots another opportunity has reserved. */
export async function heldElsewhere(
  tx: Transaction,
  deal: { id: string; unitIds: readonly string[]; parkingSlotIds: readonly string[] },
): Promise<string[]> {
  const taken: string[] = [];
  for (const [table, ids, label] of [
    [units, deal.unitIds, "Unit"],
    [propertyParkingSlots, deal.parkingSlotIds, "Parking"],
  ] as const) {
    if (!ids.length) continue;
    const rows = await tx
      .select({ code: table.identifier })
      .from(table)
      .where(
        and(
          inArray(table.id, [...ids]),
          isNotNull(table.reservedDealId),
          ne(table.reservedDealId, deal.id),
        ),
      );
    taken.push(...rows.map((row) => `${label} ${row.code}`));
  }
  return taken;
}

/** The start of every refusal for inventory another opportunity holds; callers add what to do. */
export const heldElsewhereMessage = (taken: readonly string[]) =>
  `${taken.join(", ")} ${taken.length === 1 ? "is" : "are"} already reserved by another opportunity.`;

/** Called while the deal is locked; both inventory sets are locked and checked before either changes. */
export async function syncDealInventory(
  tx: Transaction,
  input: {
    organizationId: string;
    actorUserId: string;
    dealId: string;
    propertyId: string | null;
    unitIds: string[];
    parkingSlotIds: string[];
    status: InventoryStatus;
  },
) {
  const unitIds = [...new Set(input.unitIds)].sort();
  const parkingIds = [...new Set(input.parkingSlotIds)].sort();
  // Always lock units before parking, in ID order, including inventory being released.
  const unitRows = await tx
    .select({
      id: units.id,
      propertyId: units.propertyId,
      code: units.identifier,
      status: units.status,
      reservedDealId: units.reservedDealId,
      propertyDeletedAt: properties.deletedAt,
    })
    .from(units)
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(
      and(
        eq(properties.organizationId, input.organizationId),
        or(
          unitIds.length ? inArray(units.id, unitIds) : undefined,
          eq(units.reservedDealId, input.dealId),
        ),
      ),
    )
    .orderBy(asc(units.id))
    .for("update", { of: units });
  const parkingRows = await tx
    .select({
      id: propertyParkingSlots.id,
      propertyId: propertyParkingSlots.propertyId,
      code: propertyParkingSlots.identifier,
      status: propertyParkingSlots.status,
      reservedDealId: propertyParkingSlots.reservedDealId,
      propertyDeletedAt: properties.deletedAt,
    })
    .from(propertyParkingSlots)
    .innerJoin(properties, eq(propertyParkingSlots.propertyId, properties.id))
    .where(
      and(
        eq(properties.organizationId, input.organizationId),
        or(
          parkingIds.length ? inArray(propertyParkingSlots.id, parkingIds) : undefined,
          eq(propertyParkingSlots.reservedDealId, input.dealId),
        ),
      ),
    )
    .orderBy(asc(propertyParkingSlots.id))
    .for("update", { of: propertyParkingSlots });

  if (input.status !== "available") {
    const selectedBuildings = new Set([
      ...unitRows.filter((row) => unitIds.includes(row.id)).map((row) => row.propertyId),
      ...parkingRows.filter((row) => parkingIds.includes(row.id)).map((row) => row.propertyId),
    ]);
    // Older deals saved unit IDs without a building link.
    const propertyId =
      input.propertyId ?? (selectedBuildings.size === 1 ? [...selectedBuildings][0] : null);
    for (const [ids, rows, label] of [
      [unitIds, unitRows, "unit"],
      [parkingIds, parkingRows, "parking slot"],
    ] as const) {
      for (const id of ids) {
        const row = rows.find((item) => item.id === id);
        if (
          !row ||
          // An archived building's inventory can't be newly taken; a deal that owns it keeps it.
          (row.propertyDeletedAt && row.reservedDealId !== input.dealId) ||
          row.propertyId !== propertyId ||
          !(
            (row.status === "available" && !row.reservedDealId) ||
            (row.reservedDealId === input.dealId && isHeld(row.status))
          )
        )
          throw new InventoryUnavailable(
            `The selected ${label}${row ? ` ${row.code}` : ""} is no longer available. Refresh and pick another.`,
          );
      }
    }
  }

  const changes: {
    row: InventoryRow;
    type: "unit" | "parking_slot";
    status: InventoryStatus;
    owner: string | null;
  }[] = [];
  for (const [rows, ids, type] of [
    [unitRows, unitIds, "unit"],
    [parkingRows, parkingIds, "parking_slot"],
  ] as const) {
    for (const row of rows) {
      const keep = input.status !== "available" && ids.includes(row.id);
      if (!keep && row.reservedDealId !== input.dealId) continue;
      const status = keep ? input.status : "available";
      const owner = keep ? input.dealId : null;
      if (row.status !== status || row.reservedDealId !== owner)
        changes.push({ row, type, status, owner });
    }
  }
  for (const type of ["unit", "parking_slot"] as const) {
    const table = type === "unit" ? units : propertyParkingSlots;
    for (const released of [false, true]) {
      const rows = changes.filter(
        (change) => change.type === type && (change.owner === null) === released,
      );
      if (rows.length)
        await tx
          .update(table)
          .set({
            status: released ? "available" : input.status,
            reservedDealId: released ? null : input.dealId,
            updatedAt: new Date(),
          })
          .where(
            inArray(
              table.id,
              rows.map((change) => change.row.id),
            ),
          );
    }
  }
  if (changes.length) {
    await tx.insert(auditLogs).values(
      changes.map((change) => ({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "update",
        entityType: change.type,
        entityId: change.row.id,
        oldValues: { status: change.row.status, reservedDealId: change.row.reservedDealId },
        newValues: { status: change.status, reservedDealId: change.owner, dealId: input.dealId },
      })),
    );
    await tx.insert(activities).values({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      activityType: "deal.inventory_changed",
      summary: `${changes.length} ${changes.length === 1 ? "unit or parking slot" : "units and parking slots"} updated with the opportunity.`,
      dealId: input.dealId,
      metadata: { status: input.status, unitIds, parkingSlotIds: parkingIds },
    });
  }
  return [...new Set(changes.map((change) => change.row.propertyId))];
}
