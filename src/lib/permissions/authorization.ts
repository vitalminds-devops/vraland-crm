import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import {
  authUser,
  contacts,
  deals,
  organizations,
  permissions,
  properties,
  rolePermissions,
  roles,
  tasks,
  userPermissions,
  userRoles,
  users,
} from "@/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import type { PermissionKey } from "./catalog";
import { canGrantPermissions, hasPermission, type AuthorizationContext } from "./policy";
import { grantedPropertyCondition } from "./property-access";
import { applyPermissionOverrides } from "./user-permissions";
import { dataScopeCondition, contactScopeCondition, dealScopeCondition } from "./scope";

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this operation.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

// Per-request memo: the layout, page and every query ask for this; one lookup is enough.
export const getAuthorizationContext = cache(
  async function getAuthorizationContext(): Promise<AuthorizationContext | null> {
    const session = await getCurrentSession();
    if (!session) return null;
    const [identity] = await db
      .select({
        userId: users.id,
        organizationId: users.organizationId,
      })
      .from(authUser)
      .innerJoin(users, eq(authUser.crmUserId, users.id))
      .innerJoin(organizations, eq(users.organizationId, organizations.id))
      .where(
        and(
          eq(authUser.id, session.user.id),
          eq(users.status, "active"),
          eq(organizations.isActive, true),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    if (!identity) return null;
    return {
      authUserId: session.user.id,
      userId: identity.userId,
      organizationId: identity.organizationId,
      ...(await loadAccess(identity.userId, identity.organizationId)),
    };
  },
);

/** A user's role slugs and what they can do: their roles' permissions with their own changes applied. */
export async function loadAccess(userId: string, organizationId: string) {
  const [grants, overrides] = await Promise.all([
    db
      .select({ role: roles.slug, permission: permissions.key })
      .from(userRoles)
      .innerJoin(
        roles,
        and(eq(userRoles.roleId, roles.id), eq(roles.organizationId, organizationId)),
      )
      .leftJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
      .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoles.userId, userId)),
    db
      .select({ key: userPermissions.permissionKey, granted: userPermissions.granted })
      .from(userPermissions)
      .where(eq(userPermissions.userId, userId)),
  ]);
  return {
    roles: [...new Set(grants.map((grant) => grant.role))],
    permissions: applyPermissionOverrides(
      grants.flatMap((grant) => (grant.permission ? [grant.permission] : [])),
      overrides,
    ),
  };
}

/** Whether the caller may change this user: only someone with no access the caller lacks. */
export async function canChangeUser(
  context: AuthorizationContext,
  userId: string,
): Promise<boolean> {
  const target = await loadAccess(userId, context.organizationId);
  return canGrantPermissions(context, target.permissions);
}

/** Whether the caller may assign these roles: only roles with no access the caller lacks. */
export async function canAssignRoles(
  context: AuthorizationContext,
  roleIds: readonly string[],
): Promise<boolean> {
  if (!roleIds.length) return true;
  const grants = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        inArray(rolePermissions.roleId, [...roleIds]),
        eq(roles.organizationId, context.organizationId),
      ),
    );
  return canGrantPermissions(
    context,
    grants.map((grant) => grant.key),
  );
}

export async function requireAuthorizationContext(): Promise<AuthorizationContext> {
  const context = await getAuthorizationContext();
  if (!context) throw new AuthorizationError("Authentication is required.");
  return context;
}

export async function requirePermission(permission: PermissionKey): Promise<AuthorizationContext> {
  const context = await requireAuthorizationContext();
  if (!hasPermission(context, permission)) throw new AuthorizationError();
  return context;
}

export async function requirePagePermission(
  permission: PermissionKey,
): Promise<AuthorizationContext> {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");
  if (!hasPermission(context, permission)) redirect("/forbidden");
  return context;
}

export async function getCurrentUser() {
  const context = await requireAuthorizationContext();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      organizationId: users.organizationId,
    })
    .from(users)
    .where(
      and(
        eq(users.id, context.userId),
        eq(users.organizationId, context.organizationId),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!user) throw new AuthorizationError("The CRM user is unavailable.");
  return user;
}

export async function getCurrentOrganization() {
  const context = await requireAuthorizationContext();
  const [organization] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      code: organizations.code,
      currency: organizations.currency,
      timezone: organizations.timezone,
    })
    .from(organizations)
    .where(and(eq(organizations.id, context.organizationId), eq(organizations.isActive, true)))
    .limit(1);
  if (!organization) throw new AuthorizationError("The organization is unavailable.");
  return organization;
}

type ResourceReference = {
  type: "contact" | "property" | "deal" | "task";
  id: string;
};

export async function canAccessResource(
  context: AuthorizationContext,
  resource: ResourceReference,
): Promise<boolean> {
  if (resource.type === "contact") {
    const [record] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, resource.id),
          isNull(contacts.deletedAt),
          contactScopeCondition(context),
        ),
      )
      .limit(1);
    return Boolean(record);
  }
  if (resource.type === "property") {
    const [record] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(
        and(
          eq(properties.id, resource.id),
          isNull(properties.deletedAt),
          dataScopeCondition(context, {
            organizationId: properties.organizationId,
          }),
          grantedPropertyCondition(context, { propertyId: properties.id }),
        ),
      )
      .limit(1);
    return Boolean(record);
  }
  if (resource.type === "deal") {
    const [record] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.id, resource.id), isNull(deals.deletedAt), dealScopeCondition(context)))
      .limit(1);
    return Boolean(record);
  }
  const [record] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, resource.id),
        isNull(tasks.deletedAt),
        dataScopeCondition(context, {
          organizationId: tasks.organizationId,
          ownerUserId: tasks.assignedUserId,
        }),
      ),
    )
    .limit(1);
  return Boolean(record);
}
