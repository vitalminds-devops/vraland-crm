"use server";

import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  activities,
  auditLogs,
  floors,
  properties,
  propertyAccessGrantTargets,
  parkingSlots,
  propertyAccessGrants,
  units,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { canGrantUnitAccess, hasUnrestrictedInventoryAccess } from "@/lib/permissions/policy";
import {
  grantableUserCondition,
  grantedPropertyCondition,
} from "@/lib/permissions/property-access";
import { dataScopeCondition } from "@/lib/permissions/scope";
import { buildChangeSet } from "@/lib/audit/redact";
import {
  type ActionResult,
  databaseFailure,
  failure,
  notFoundFailure,
  success,
  validationFailure,
  validationFailureFromZod,
} from "@/lib/types/action-result";
import { outOfScope, permissionDenied } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { readGrantTargets } from "../queries/property-access.queries";

const grantSchema = z.object({
  propertyId: z.uuid(),
  userId: z.uuid(),
  floorIds: z.array(z.uuid()).max(500).default([]),
  unitIds: z.array(z.uuid()).max(2000).default([]),
  excludedUnitIds: z.array(z.uuid()).max(2000).default([]),
  parkingSlotIds: z.array(z.uuid()).max(2000).default([]),
});

const clearSchema = z.object({
  propertyId: z.uuid(),
  userId: z.uuid(),
});

const bulkSchema = z.object({
  /** One person, or every non-administrator in the organization. */
  userId: z.uuid().optional(),
  everyone: z.boolean().default(false),
});
class AccessInventoryUnavailable extends Error {}

export type PropertyAccessResult = ActionResult<{ id: string }>;

export async function setPropertyGrant(input: unknown): Promise<PropertyAccessResult> {
  const context = await requirePermission("properties.view");
  if (!canGrantUnitAccess(context))
    return failure(permissionDenied("You can't give access to properties."));

  const parsed = grantSchema.safeParse(input);
  if (!parsed.success)
    return validationFailureFromZod(
      parsed.error,
      "Choose a user, and the floors and units they may see.",
    );
  const v = parsed.data;

  const target = await findGrantableUser(context, v.userId);
  if (!target) return failure(outOfScope("You can't give access to this user."));

  const property = await findGrantableProperty(context, v.propertyId);
  if (!property) return notFoundFailure("Property");

  const checked = await readTargets(v.propertyId, v.floorIds, v.unitIds, v.excludedUnitIds);
  if ("error" in checked) return validationFailure(checked.error);
  if (v.parkingSlotIds.length) {
    const found = await db
      .select({ id: parkingSlots.id })
      .from(parkingSlots)
      .where(
        and(eq(parkingSlots.propertyId, v.propertyId), inArray(parkingSlots.id, v.parkingSlotIds)),
      );
    if (found.length !== new Set(v.parkingSlotIds).size)
      return validationFailure("Every parking slot you name must belong to this property.");
  }

  if (!hasUnrestrictedInventoryAccess(context)) {
    const subsetError = await checkSubset(context.userId, v, checked);
    if (subsetError) return validationFailure(subsetError);
  }

  try {
    const grantId = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ id: propertyAccessGrants.id })
        .from(propertyAccessGrants)
        .where(
          and(
            eq(propertyAccessGrants.userId, v.userId),
            eq(propertyAccessGrants.propertyId, v.propertyId),
          ),
        )
        .limit(1);
      const beforeTargets = before
        ? await tx
            .select({
              floorId: propertyAccessGrantTargets.floorId,
              unitId: propertyAccessGrantTargets.unitId,
              parkingSlotId: propertyAccessGrantTargets.parkingSlotId,
              isExclusion: propertyAccessGrantTargets.isExclusion,
            })
            .from(propertyAccessGrantTargets)
            .where(eq(propertyAccessGrantTargets.grantId, before.id))
        : [];

      const wholeBefore = Boolean(before) && beforeTargets.length === 0;
      const wasGivenUnit = (id: string, floorId: string) =>
        wholeBefore ||
        (beforeTargets.some(
          (item) => !item.isExclusion && (item.unitId === id || item.floorId === floorId),
        ) &&
          !beforeTargets.some((item) => item.isExclusion && item.unitId === id));
      const unavailableUnits =
        v.unitIds.length || v.floorIds.length
          ? await tx
              .select({ id: units.id, floorId: units.floorId })
              .from(units)
              .where(
                and(
                  eq(units.propertyId, v.propertyId),
                  ne(units.status, "available"),
                  or(
                    v.unitIds.length ? inArray(units.id, v.unitIds) : undefined,
                    v.floorIds.length ? inArray(units.floorId, v.floorIds) : undefined,
                  ),
                ),
              )
              .orderBy(asc(units.id))
              .for("update")
          : [];
      if (
        unavailableUnits.some(
          (unit) => v.unitIds.includes(unit.id) && !wasGivenUnit(unit.id, unit.floorId),
        )
      )
        throw new AccessInventoryUnavailable(
          "Sold-out, reserved and inactive units cannot be newly selected. Refresh and choose available units.",
        );
      v.excludedUnitIds = [
        ...new Set([
          ...v.excludedUnitIds,
          ...unavailableUnits
            .filter(
              (unit) => v.floorIds.includes(unit.floorId) && !wasGivenUnit(unit.id, unit.floorId),
            )
            .map((unit) => unit.id),
        ]),
      ];
      if (v.excludedUnitIds.length > 2000)
        throw new AccessInventoryUnavailable(
          "Select available units individually when these floors contain more than 2,000 unavailable units.",
        );
      const unavailableParking = v.parkingSlotIds.length
        ? await tx
            .select({ id: parkingSlots.id })
            .from(parkingSlots)
            .where(
              and(
                eq(parkingSlots.propertyId, v.propertyId),
                inArray(parkingSlots.id, v.parkingSlotIds),
                ne(parkingSlots.status, "available"),
              ),
            )
            .orderBy(asc(parkingSlots.id))
            .for("update")
        : [];
      if (
        unavailableParking.some(
          (slot) => !wholeBefore && !beforeTargets.some((item) => item.parkingSlotId === slot.id),
        )
      )
        throw new AccessInventoryUnavailable(
          "Sold-out, reserved and inactive parking slots cannot be newly selected. Refresh and choose available slots.",
        );

      const [grant] = await tx
        .insert(propertyAccessGrants)
        .values({
          userId: v.userId,
          propertyId: v.propertyId,
          createdBy: context.userId,
          updatedBy: context.userId,
        })
        .onConflictDoUpdate({
          target: [propertyAccessGrants.userId, propertyAccessGrants.propertyId],
          set: { updatedBy: context.userId, updatedAt: new Date() },
        })
        .returning({ id: propertyAccessGrants.id });

      if (!grant) throw new Error("The access grant was not written.");

      await tx
        .delete(propertyAccessGrantTargets)
        .where(eq(propertyAccessGrantTargets.grantId, grant.id));
      const targets = [
        ...v.floorIds.map((floorId) => ({ grantId: grant.id, floorId })),
        ...v.unitIds.map((unitId) => ({ grantId: grant.id, unitId })),
        ...v.excludedUnitIds.map((unitId) => ({
          grantId: grant.id,
          unitId,
          isExclusion: true,
        })),
        ...v.parkingSlotIds.map((parkingSlotId) => ({ grantId: grant.id, parkingSlotId })),
      ];
      if (targets.length) await tx.insert(propertyAccessGrantTargets).values(targets);

      const beforeGrant = {
        floorIds: beforeTargets.flatMap((t) => (t.isExclusion ? [] : (t.floorId ?? []))),
        unitIds: beforeTargets.flatMap((t) => (t.isExclusion ? [] : (t.unitId ?? []))),
        excludedUnitIds: beforeTargets.flatMap((t) => (t.isExclusion ? (t.unitId ?? []) : [])),
        parkingSlotIds: beforeTargets.flatMap((t) =>
          t.isExclusion ? [] : (t.parkingSlotId ?? []),
        ),
      };
      const changeSet = buildChangeSet(beforeGrant, {
        floorIds: v.floorIds,
        unitIds: v.unitIds,
        excludedUnitIds: v.excludedUnitIds,
        parkingSlotIds: v.parkingSlotIds,
      });

      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: before ? "update" : "create",
        entityType: "property_access_grant",
        entityId: grant.id,
        oldValues: {
          userId: v.userId,
          propertyId: v.propertyId,
          ...changeSet.oldValues,
        },
        newValues: {
          userId: v.userId,
          propertyId: v.propertyId,
          ...changeSet.newValues,
        },
      });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: before ? "property.access_changed" : "property.access_granted",
        summary:
          `${target.firstName} ${target.lastName} was given ${describeGrant(v.floorIds.length, v.unitIds.length, v.excludedUnitIds.length, v.parkingSlotIds.length)} on ${property.title}.`.trim(),
        propertyId: v.propertyId,
        metadata: {
          userId: v.userId,
          floorIds: v.floorIds,
          unitIds: v.unitIds,
          excludedUnitIds: v.excludedUnitIds,
          parkingSlotIds: v.parkingSlotIds,
        },
      });

      return grant.id;
    });

    refreshAccess(v.propertyId);
    return success({ id: grantId });
  } catch (error) {
    if (error instanceof AccessInventoryUnavailable) return validationFailure(error.message);
    logError("Property access grant write failed", error, {
      operation: "set_property_grant",
      propertyId: v.propertyId,
      userId: v.userId,
    });
    return databaseFailure("Property access couldn't be saved.");
  }
}

export async function clearPropertyGrant(input: unknown): Promise<PropertyAccessResult> {
  const context = await requirePermission("properties.view");
  if (!canGrantUnitAccess(context))
    return failure(permissionDenied("You can't change property access."));

  const parsed = clearSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error, "Choose a user to remove.");
  const v = parsed.data;

  const target = await findGrantableUser(context, v.userId);
  if (!target) return failure(outOfScope("You can't change access for this user."));

  const property = await findGrantableProperty(context, v.propertyId);
  if (!property) return notFoundFailure("Property");

  try {
    const removed = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: propertyAccessGrants.id })
        .from(propertyAccessGrants)
        .where(
          and(
            eq(propertyAccessGrants.userId, v.userId),
            eq(propertyAccessGrants.propertyId, v.propertyId),
          ),
        )
        .limit(1);
      if (!existing) return null;

      await tx
        .delete(propertyAccessGrantTargets)
        .where(eq(propertyAccessGrantTargets.grantId, existing.id));
      await tx.delete(propertyAccessGrants).where(eq(propertyAccessGrants.id, existing.id));

      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "property_access_grant",
        entityId: existing.id,
        oldValues: { userId: v.userId, propertyId: v.propertyId },
        newValues: { userId: null },
      });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "property.access_revoked",
        summary:
          `${target.firstName} ${target.lastName} no longer has access to ${property.title}.`.trim(),
        propertyId: v.propertyId,
        metadata: { userId: v.userId },
      });

      return existing.id;
    });

    refreshAccess(v.propertyId);
    return success({ id: removed ?? v.propertyId });
  } catch (error) {
    logError("Property access grant clear failed", error, {
      operation: "clear_property_grant",
      propertyId: v.propertyId,
      userId: v.userId,
    });
    return databaseFailure("Property access couldn't be removed.");
  }
}

export async function grantEveryProperty(input: unknown): Promise<PropertyAccessResult> {
  const context = await requirePermission("properties.view");
  if (!hasUnrestrictedInventoryAccess(context))
    return failure(
      permissionDenied(
        "Only an administrator can give every property in the organization at once.",
      ),
    );

  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success)
    return validationFailureFromZod(parsed.error, "Choose who to give access to.");
  const v = parsed.data;
  if (!v.everyone && !v.userId) return validationFailure("Choose a user, or everyone.");

  const target = v.everyone ? null : await findGrantableUser(context, v.userId!);
  if (!v.everyone && !target) return failure(outOfScope("You can't change access for this user."));

  const granteeIds = v.everyone
    ? await listOrganizationGrantees(context.organizationId)
    : [target!.id];

  if (!granteeIds.length) return success({ id: context.organizationId });

  try {
    const written = await db.transaction(async (tx) => {
      const propertyRows = await tx
        .select({ id: properties.id })
        .from(properties)
        .where(
          and(eq(properties.organizationId, context.organizationId), isNull(properties.deletedAt)),
        );
      if (!propertyRows.length) return 0;

      const grantRows = propertyRows.flatMap((property) =>
        granteeIds.map((userId) => ({
          userId,
          propertyId: property.id,
          createdBy: context.userId,
          updatedBy: context.userId,
        })),
      );
      const inserted: { id: string }[] = [];
      // Postgres caps one statement at 65,535 parameters.
      for (let i = 0; i < grantRows.length; i += 1000)
        inserted.push(
          ...(await tx
            .insert(propertyAccessGrants)
            .values(grantRows.slice(i, i + 1000))
            .onConflictDoNothing({
              target: [propertyAccessGrants.userId, propertyAccessGrants.propertyId],
            })
            .returning({ id: propertyAccessGrants.id })),
        );

      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "property_access_grant",
        entityId: context.organizationId,
        oldValues: {},
        newValues: {
          scope: v.everyone ? "everyone" : v.userId,
          users: granteeIds.length,
          properties: propertyRows.length,
          grantsWritten: inserted.length,
        },
      });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "property.access_granted_in_bulk",
        summary: `Whole-property access given ${inserted.length} ${inserted.length === 1 ? "time" : "times"} across ${propertyRows.length} ${propertyRows.length === 1 ? "property" : "properties"}.`,
        metadata: {
          users: granteeIds.length,
          properties: propertyRows.length,
          grantsWritten: inserted.length,
        },
      });

      return inserted.length;
    });

    revalidatePath("/properties");
    return success({ id: String(written) });
  } catch (error) {
    logError("Bulk property access grant failed", error, {
      operation: "grant_every_property",
      everyone: v.everyone,
      userId: v.userId,
    });
    return databaseFailure("Couldn't give access.");
  }
}

/** Every non-administrator in the organization, for the bulk grant. */
async function listOrganizationGrantees(organizationId: string) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        isNull(users.deletedAt),
        eq(users.status, "active"),
        sql`not exists (
          select 1 from user_roles ur
          join roles r on r.id = ur.role_id
          where ur.user_id = ${users.id}
            and r.organization_id = ${organizationId}
            and r.slug in ('super-administrator', 'administrator')
        )`,
      ),
    );
  return rows.map((row) => row.id);
}

async function findGrantableUser(
  context: Awaited<ReturnType<typeof requirePermission>>,
  userId: string,
) {
  const [target] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(and(eq(users.id, userId), grantableUserCondition(context)))
    .limit(1);
  return target ?? null;
}

async function findGrantableProperty(
  context: Awaited<ReturnType<typeof requirePermission>>,
  propertyId: string,
) {
  const [property] = await db
    .select({ id: properties.id, title: properties.title })
    .from(properties)
    .where(
      and(
        eq(properties.id, propertyId),
        isNull(properties.deletedAt),
        dataScopeCondition(context, {
          organizationId: properties.organizationId,
        }),
        grantedPropertyCondition(context, { propertyId: properties.id }),
      ),
    )
    .limit(1);
  return property ?? null;
}

async function readTargets(
  propertyId: string,
  floorIds: string[],
  unitIds: string[],
  excludedUnitIds: string[],
): Promise<
  | { error: string }
  | {
      units: { id: string; floorId: string }[];
      excluded: { id: string; floorId: string }[];
    }
> {
  if (floorIds.length) {
    const found = await db
      .select({ id: floors.id })
      .from(floors)
      .where(and(eq(floors.propertyId, propertyId), inArray(floors.id, floorIds)));
    if (found.length !== new Set(floorIds).size)
      return {
        error: "Every floor you name must belong to this property.",
      };
  }

  const unitsOnProperty = unitIds.length
    ? await db
        .select({ id: units.id, floorId: units.floorId })
        .from(units)
        .where(and(eq(units.propertyId, propertyId), inArray(units.id, unitIds)))
    : [];
  if (unitsOnProperty.length !== new Set(unitIds).size)
    return { error: "Every unit you name must belong to this property." };

  const excludedOnProperty = excludedUnitIds.length
    ? await db
        .select({ id: units.id, floorId: units.floorId })
        .from(units)
        .where(and(eq(units.propertyId, propertyId), inArray(units.id, excludedUnitIds)))
    : [];
  if (excludedOnProperty.length !== new Set(excludedUnitIds).size)
    return { error: "Every unit you switch off must belong to this property." };

  const namedFloors = new Set(floorIds);
  if (excludedOnProperty.some((unit) => !namedFloors.has(unit.floorId)))
    return {
      error: "Only units on a given floor can be held back.",
    };

  const namedUnits = new Set(unitIds);
  if (excludedUnitIds.some((unitId) => namedUnits.has(unitId)))
    return {
      error: "A unit cannot be given and held back at the same time.",
    };

  return { units: unitsOnProperty, excluded: excludedOnProperty };
}

async function checkSubset(
  granterId: string,
  input: {
    propertyId: string;
    floorIds: string[];
    unitIds: string[];
    excludedUnitIds: string[];
    parkingSlotIds: string[];
  },
  checked: {
    units: { id: string; floorId: string }[];
    excluded: { id: string; floorId: string }[];
  },
): Promise<string | null> {
  const held = await readGrantTargets(granterId, input.propertyId);
  if (!held) return "You can only give access to a property you have access to yourself.";

  const wholeProperty =
    held.floorIds.length === 0 &&
    held.unitIds.length === 0 &&
    held.excludedUnitIds.length === 0 &&
    held.parkingSlotIds.length === 0;
  if (wholeProperty) return null;

  const namedAnything =
    input.floorIds.length > 0 || input.unitIds.length > 0 || input.parkingSlotIds.length > 0;
  if (!namedAnything)
    return "You only have part of this property. Choose floors, units or parking.";

  const heldParking = new Set(held.parkingSlotIds);
  if (input.parkingSlotIds.some((id) => !heldParking.has(id)))
    return "You can only give parking slots you have access to.";

  const heldFloors = new Set(held.floorIds);
  const heldUnits = new Set(held.unitIds);
  const heldBack = new Set(held.excludedUnitIds);

  const outsideFloor = input.floorIds.find((id) => !heldFloors.has(id));
  if (outsideFloor) return "You can only give away floors you have access to yourself.";

  if (checked.units.some((unit) => heldBack.has(unit.id)))
    return "You cannot give away a unit held back from you.";

  const outsideUnit = checked.units.find(
    (unit) => !heldUnits.has(unit.id) && !heldFloors.has(unit.floorId),
  );
  if (outsideUnit) return "You can only give units you have access to.";

  if (heldBack.size) {
    const heldBackUnits = await db
      .select({ id: units.id, floorId: units.floorId })
      .from(units)
      .where(and(eq(units.propertyId, input.propertyId), inArray(units.id, [...heldBack])));
    const givenFloors = new Set(input.floorIds);
    // Preserve exclusions without sending hidden inventory to the browser.
    input.excludedUnitIds = [
      ...new Set([
        ...input.excludedUnitIds,
        ...heldBackUnits.filter((unit) => givenFloors.has(unit.floorId)).map((unit) => unit.id),
      ]),
    ];
  }

  return null;
}

/** A clause for the activity feed, in the terms a broker would use. */
function describeGrant(floorCount: number, unitCount: number, excludedCount = 0, parkingCount = 0) {
  const named = [
    floorCount ? `${floorCount} ${floorCount === 1 ? "floor" : "floors"}` : "",
    unitCount ? `${unitCount} ${unitCount === 1 ? "unit" : "units"}` : "",
    parkingCount ? `${parkingCount} parking ${parkingCount === 1 ? "slot" : "slots"}` : "",
  ]
    .filter(Boolean)
    .join(" and ");
  const granted = named ? `access to ${named}` : "access to the whole property";
  if (!excludedCount) return granted;
  return `${granted}, with ${excludedCount} ${excludedCount === 1 ? "unit" : "units"} held back`;
}

function refreshAccess(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath(`/properties/${propertyId}/access`);
  revalidatePath("/properties");
}
