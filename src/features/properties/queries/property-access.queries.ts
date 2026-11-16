import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { propertyAccessGrantTargets, propertyAccessGrants, users } from "@/db/schema";
import { AuthorizationError, requirePermission } from "@/lib/permissions/authorization";
import { canGrantUnitAccess, hasPermission } from "@/lib/permissions/policy";
import { grantableUserCondition } from "@/lib/permissions/property-access";
import { accessPageMode } from "../lib/access-page-mode";

async function requireAccessGranter() {
  const context = await requirePermission("properties.view");
  if (!canGrantUnitAccess(context))
    throw new AuthorizationError("You do not have permission to grant access to properties.");
  return context;
}

export type AccessGrantee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

export async function listAccessGrantees(): Promise<AccessGrantee[]> {
  const context = await requireAccessGranter();

  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(grantableUserCondition(context))
    .orderBy(asc(users.firstName), asc(users.lastName));
}

export type PropertyGrantTargets = {
  floorIds: string[];
  unitIds: string[];
  /** Units taken back out of a floor this grant names. */
  excludedUnitIds: string[];
  parkingSlotIds: string[];
};

export async function readGrantTargets(
  userId: string,
  propertyId: string,
): Promise<PropertyGrantTargets | null> {
  const [grant] = await db
    .select({ id: propertyAccessGrants.id })
    .from(propertyAccessGrants)
    .where(
      and(eq(propertyAccessGrants.propertyId, propertyId), eq(propertyAccessGrants.userId, userId)),
    )
    .limit(1);
  if (!grant) return null;

  const targets = await db
    .select({
      floorId: propertyAccessGrantTargets.floorId,
      unitId: propertyAccessGrantTargets.unitId,
      parkingSlotId: propertyAccessGrantTargets.parkingSlotId,
      isExclusion: propertyAccessGrantTargets.isExclusion,
    })
    .from(propertyAccessGrantTargets)
    .where(eq(propertyAccessGrantTargets.grantId, grant.id));

  return {
    floorIds: targets.flatMap((target) => (target.isExclusion ? [] : (target.floorId ?? []))),
    unitIds: targets.flatMap((target) => (target.isExclusion ? [] : (target.unitId ?? []))),
    excludedUnitIds: targets.flatMap((target) => (target.isExclusion ? (target.unitId ?? []) : [])),
    parkingSlotIds: targets.flatMap((target) =>
      target.isExclusion ? [] : (target.parkingSlotId ?? []),
    ),
  };
}

/** The editor's seed: the selected person's grant, or null for none. */
export async function getPropertyGrant(
  propertyId: string,
  userId: string,
): Promise<PropertyGrantTargets | null> {
  await requireAccessGranter();
  return readGrantTargets(userId, propertyId);
}

export type PropertyGrantSummary = {
  userId: string;
  firstName: string;
  lastName: string;
  /** No targets: the whole property. */
  isWholeProperty: boolean;
  floorCount: number;
  unitCount: number;
  parkingCount: number;
  /** Units named as held back from a floor this grant gives away. */
  heldBackCount: number;
  updatedAt: Date;
};

export async function listPropertyGrants(propertyId: string): Promise<PropertyGrantSummary[]> {
  const context = await requirePermission("properties.view");
  // Granters, and anyone who may see everyone's access (read-only Access page).
  if (!accessPageMode(context))
    throw new AuthorizationError("You do not have permission to see access to properties.");

  const grants = await db
    .select({
      userId: propertyAccessGrants.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      updatedAt: propertyAccessGrants.updatedAt,
      floors:
        sql<number>`count(*) filter (where ${propertyAccessGrantTargets.floorId} is not null)`.mapWith(
          Number,
        ),
      units:
        sql<number>`count(*) filter (where ${propertyAccessGrantTargets.unitId} is not null and ${propertyAccessGrantTargets.isExclusion} = false)`.mapWith(
          Number,
        ),
      parking:
        sql<number>`count(*) filter (where ${propertyAccessGrantTargets.parkingSlotId} is not null)`.mapWith(
          Number,
        ),
      heldBack:
        sql<number>`count(*) filter (where ${propertyAccessGrantTargets.isExclusion} = true)`.mapWith(
          Number,
        ),
    })
    .from(propertyAccessGrants)
    .innerJoin(users, eq(propertyAccessGrants.userId, users.id))
    .leftJoin(
      propertyAccessGrantTargets,
      eq(propertyAccessGrantTargets.grantId, propertyAccessGrants.id),
    )
    .where(
      and(
        eq(propertyAccessGrants.propertyId, propertyId),
        // Without the permission, only grants to people the caller could give access to.
        hasPermission(context, "properties.view_all_access")
          ? undefined
          : grantableUserCondition(context),
      ),
    )
    .groupBy(
      propertyAccessGrants.id,
      propertyAccessGrants.userId,
      users.firstName,
      users.lastName,
      propertyAccessGrants.updatedAt,
    )
    .orderBy(asc(users.firstName), asc(users.lastName));

  return grants.map((grant) => ({
    userId: grant.userId,
    firstName: grant.firstName,
    lastName: grant.lastName,
    isWholeProperty: grant.floors === 0 && grant.units === 0 && grant.parking === 0,
    floorCount: grant.floors,
    unitCount: grant.units,
    parkingCount: grant.parking,
    heldBackCount: grant.heldBack,
    updatedAt: grant.updatedAt,
  }));
}
