import "server-only";

import { and, eq, exists, inArray, isNull, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  propertyAccessGrantTargets,
  propertyAccessGrants,
  roles,
  units,
  userRoles,
  users,
} from "@/db/schema";
import {
  administratorRoleSlugs,
  agentRoleSlug,
  brokerIdTargetRoleSlugs,
  isBrokerAccessRoleSlug,
  masterBrokerRoleSlug,
} from "@/lib/permissions/catalog";
import { hasUnrestrictedInventoryAccess, type AuthorizationContext } from "./policy";

/** The one column every property-level check needs. */
export type PropertyAccessColumns = { propertyId: AnyPgColumn };

/** The three ids a unit-level check needs. */
export type UnitAccessColumns = {
  propertyId: AnyPgColumn;
  floorId: AnyPgColumn;
  unitId: AnyPgColumn;
};

/** The two ids a floor-level check needs. */
export type FloorAccessColumns = {
  propertyId: AnyPgColumn;
  floorId: AnyPgColumn;
};

function targetsOfGrant(match?: SQL): SQL {
  return exists(
    db
      .select({ id: propertyAccessGrantTargets.id })
      .from(propertyAccessGrantTargets)
      .where(
        and(
          eq(propertyAccessGrantTargets.grantId, propertyAccessGrants.id),
          eq(propertyAccessGrantTargets.isExclusion, false),
          match,
        ),
      ),
  );
}

function unitIsNotExcluded(unitId: AnyPgColumn): SQL {
  return notExists(
    db
      .select({ id: propertyAccessGrantTargets.id })
      .from(propertyAccessGrantTargets)
      .where(
        and(
          eq(propertyAccessGrantTargets.grantId, propertyAccessGrants.id),
          eq(propertyAccessGrantTargets.isExclusion, true),
          eq(propertyAccessGrantTargets.unitId, unitId),
        ),
      ),
  );
}

function grantIsWholeProperty(): SQL {
  return notExists(
    db
      .select({ id: propertyAccessGrantTargets.id })
      .from(propertyAccessGrantTargets)
      .where(
        and(
          eq(propertyAccessGrantTargets.grantId, propertyAccessGrants.id),
          eq(propertyAccessGrantTargets.isExclusion, false),
        ),
      ),
  );
}

function grantCondition(userId: string, propertyId: AnyPgColumn, match?: SQL): SQL {
  return exists(
    db
      .select({ id: propertyAccessGrants.id })
      .from(propertyAccessGrants)
      .where(
        and(
          eq(propertyAccessGrants.userId, userId),
          eq(propertyAccessGrants.propertyId, propertyId),
          match ? or(grantIsWholeProperty(), targetsOfGrant(match)) : undefined,
        ),
      ),
  );
}

export function grantedPropertyCondition(
  context: AuthorizationContext,
  columns: PropertyAccessColumns,
): SQL {
  if (hasUnrestrictedInventoryAccess(context)) return sql`true`;
  return grantCondition(context.userId, columns.propertyId);
}

export function grantedUnitsCondition(
  context: AuthorizationContext,
  columns: UnitAccessColumns,
): SQL {
  if (hasUnrestrictedInventoryAccess(context)) return sql`true`;

  return grantCondition(
    context.userId,
    columns.propertyId,
    and(
      or(
        eq(propertyAccessGrantTargets.unitId, columns.unitId),
        eq(propertyAccessGrantTargets.floorId, columns.floorId),
      ),
      unitIsNotExcluded(columns.unitId),
    )!,
  );
}

/** Parking follows the grant: a whole-property grant shows every slot, a partial one only named slots. */
export function grantedParkingCondition(
  context: AuthorizationContext,
  columns: { propertyId: AnyPgColumn; parkingSlotId: AnyPgColumn },
): SQL {
  if (hasUnrestrictedInventoryAccess(context)) return sql`true`;
  return grantCondition(
    context.userId,
    columns.propertyId,
    eq(propertyAccessGrantTargets.parkingSlotId, columns.parkingSlotId),
  );
}

export function grantedFloorsCondition(
  context: AuthorizationContext,
  columns: FloorAccessColumns,
): SQL {
  if (hasUnrestrictedInventoryAccess(context)) return sql`true`;

  return or(
    grantCondition(
      context.userId,
      columns.propertyId,
      eq(propertyAccessGrantTargets.floorId, columns.floorId),
    ),
    exists(
      db
        .select({ id: units.id })
        .from(units)
        .where(
          and(
            eq(units.floorId, columns.floorId),
            grantedUnitsCondition(context, {
              propertyId: units.buildingId,
              floorId: units.floorId,
              unitId: units.id,
            }),
          ),
        ),
    ),
  )!;
}

const masterBrokerGranteeRoleSlugs = [...brokerIdTargetRoleSlugs, agentRoleSlug] as const;

/** Whether a `users` row holds any of `slugs`, as an `exists` over `user_roles`. */
function userHasRoleSlug(slugs: readonly string[]): SQL {
  return exists(
    db
      .select({ id: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          eq(userRoles.userId, users.id),
          eq(roles.organizationId, users.organizationId),
          inArray(roles.slug, [...slugs]),
        ),
      ),
  );
}

export function grantableUserCondition(context: AuthorizationContext): SQL {
  const base = and(
    eq(users.organizationId, context.organizationId),
    isNull(users.deletedAt),
    eq(users.status, "active"),
    ne(users.id, context.userId),
    notExists(
      db
        .select({ id: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(
          and(
            eq(userRoles.userId, users.id),
            eq(roles.organizationId, context.organizationId),
            inArray(roles.slug, [...administratorRoleSlugs]),
          ),
        ),
    ),
  )!;

  if (hasUnrestrictedInventoryAccess(context)) return base;

  if (context.roles.includes(masterBrokerRoleSlug)) {
    return and(base, userHasRoleSlug(masterBrokerGranteeRoleSlugs))!;
  }

  if (context.roles.some(isBrokerAccessRoleSlug)) {
    return and(base, eq(users.brokerId, context.userId))!;
  }

  return sql`false`;
}
