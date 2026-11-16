import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  ilike,
  isNull,
  notExists,
  not,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  commissionLinks,
  documents,
  organizations,
  permissions,
  rolePermissions,
  roles,
  userPermissions,
  userRoles,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { brokerIdTargetRoleSlugs, permissionCatalog } from "@/lib/permissions/catalog";
import { canManageUsers, resolveDataScope } from "@/lib/permissions/policy";
import { applyPermissionOverrides } from "@/lib/permissions/user-permissions";

export async function getSettingsSummary() {
  const context = await requirePermission("settings.view");
  const organizationId = context.organizationId;

  const [
    organizationRows,
    userStatusRows,
    roleKindRows,
    auditCountRows,
    teamRows,
    recentActivityRows,
  ] = await Promise.all([
    db
      .select({
        name: organizations.name,
        code: organizations.code,
        legalName: organizations.legalName,
        email: organizations.email,
        phone: organizations.phone,
        website: organizations.website,
        currency: organizations.currency,
        timezone: organizations.timezone,
        city: organizations.city,
        province: organizations.province,
        countryCode: organizations.countryCode,
        isActive: organizations.isActive,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1),
    db
      .select({ status: users.status, total: count() })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), isNull(users.deletedAt)))
      .groupBy(users.status),
    db
      .select({ isSystem: roles.isSystem, total: count() })
      .from(roles)
      .where(eq(roles.organizationId, organizationId))
      .groupBy(roles.isSystem),
    db
      .select({ total: count() })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, organizationId)),
    db
      .select({
        id: roles.id,
        name: roles.name,
        slug: roles.slug,
        isSystem: roles.isSystem,
        memberCount: count(userRoles.userId),
      })
      .from(roles)
      .leftJoin(userRoles, eq(userRoles.roleId, roles.id))
      .where(eq(roles.organizationId, organizationId))
      .groupBy(roles.id, roles.name, roles.slug, roles.isSystem)
      .orderBy(desc(count(userRoles.userId)), asc(roles.name))
      .limit(8),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        occurredAt: auditLogs.occurredAt,
        actorFirstName: users.firstName,
        actorLastName: users.lastName,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(eq(auditLogs.organizationId, organizationId))
      .orderBy(desc(auditLogs.occurredAt))
      .limit(6),
  ]);

  const byStatus = new Map(userStatusRows.map((row) => [row.status, Number(row.total)]));
  const totals = <T extends { total: unknown }>(rows: T[]) =>
    rows.reduce((sum, row) => sum + Number(row.total), 0);

  const totalUsers = totals(userStatusRows);
  const totalRoles = totals(roleKindRows);
  const systemRoles =
    roleKindRows.filter((row) => row.isSystem).reduce((sum, row) => sum + Number(row.total), 0) ??
    0;

  return {
    organization: organizationRows[0] ?? null,
    users: {
      total: totalUsers,
      active: byStatus.get("active") ?? 0,
      invited: byStatus.get("invited") ?? 0,
      inactive: byStatus.get("inactive") ?? 0,
      suspended: byStatus.get("suspended") ?? 0,
    },
    roles: {
      total: totalRoles,
      system: systemRoles,
      custom: totalRoles - systemRoles,
    },
    auditEntries: Number(auditCountRows[0]?.total ?? 0),
    team: teamRows.map((row) => ({
      ...row,
      memberCount: Number(row.memberCount),
    })),
    recentActivity: recentActivityRows,
  };
}

/** Whose records each listed user reaches, worked out from the data access permissions as sign-in does. */
async function dataScopeResolver(organizationId: string, userIds: string[]) {
  const scopeKeys = [...permissionCatalog.records];
  const [roleGrants, overrides] = await Promise.all([
    db
      .select({ roleId: rolePermissions.roleId, key: permissions.key })
      .from(rolePermissions)
      .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(and(eq(roles.organizationId, organizationId), inArray(permissions.key, scopeKeys))),
    userIds.length
      ? db
          .select({
            userId: userPermissions.userId,
            key: userPermissions.permissionKey,
            granted: userPermissions.granted,
          })
          .from(userPermissions)
          .where(
            and(
              inArray(userPermissions.userId, userIds),
              inArray(userPermissions.permissionKey, scopeKeys),
            ),
          )
      : [],
  ]);
  return (userId: string, userRoleRows: { id: string }[]) => {
    const fromRoles = roleGrants
      .filter((grant) => userRoleRows.some((role) => role.id === grant.roleId))
      .map((grant) => grant.key);
    const own = overrides.filter((row) => row.userId === userId);
    return resolveDataScope({ permissions: applyPermissionOverrides(fromRoles, own) });
  };
}

export async function listUsers(search?: string) {
  const context = await requirePermission("users.manage");
  const superAdministratorRole = or(
    eq(roles.slug, "super-administrator"),
    ilike(roles.name, "super administrator"),
  );
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      avatarUrl: users.avatarUrl,
      brokerId: users.brokerId,
      roleId: roles.id,
      roleName: roles.name,
      roleSlug: roles.slug,
    })
    .from(users)
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .leftJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(users.organizationId, context.organizationId),
        isNull(users.deletedAt),
        notExists(
          db
            .select({ id: userRoles.userId })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(
              and(
                eq(userRoles.userId, users.id),
                eq(roles.organizationId, context.organizationId),
                superAdministratorRole,
              ),
            ),
        ),
        search
          ? ilike(
              sql`concat(${users.firstName},' ',${users.lastName},' ',${users.email})`,
              `%${search}%`,
            )
          : undefined,
      ),
    )
    .orderBy(asc(users.lastName));

  const grouped = new Map<
    string,
    (typeof rows)[number] & {
      roles: { id: string; name: string; slug: string }[];
    }
  >();
  for (const row of rows) {
    const item = grouped.get(row.id) ?? { ...row, roles: [] };
    if (row.roleId && row.roleName && row.roleSlug)
      item.roles.push({
        id: row.roleId,
        name: row.roleName,
        slug: row.roleSlug,
      });
    grouped.set(row.id, item);
  }

  const userIds = [...grouped.keys()];
  const dataScopeOf = await dataScopeResolver(context.organizationId, userIds);
  const userDocuments = userIds.length
    ? await db
        .select({
          id: documents.id,
          userId: documents.userId,
          name: documents.name,
          documentType: documents.documentType,
          mimeType: documents.mimeType,
          fileSizeBytes: documents.fileSizeBytes,
          createdAt: documents.createdAt,
          validFrom: documents.validFrom,
          validUntil: documents.validUntil,
          certificateNumber: documents.certificateNumber,
        })
        .from(documents)
        .where(
          and(
            eq(documents.organizationId, context.organizationId),
            inArray(documents.userId, userIds),
          ),
        )
        .orderBy(desc(documents.createdAt))
    : [];
  const documentsByUser = new Map<string, typeof userDocuments>();
  for (const document of userDocuments) {
    if (!document.userId) continue;
    const list = documentsByUser.get(document.userId) ?? [];
    list.push(document);
    documentsByUser.set(document.userId, list);
  }

  const [roleRows, brokerRows, agentRows] = await Promise.all([
    db
      .select({ id: roles.id, name: roles.name, slug: roles.slug })
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, context.organizationId),
          not(eq(roles.slug, "super-administrator")),
          not(ilike(roles.name, "super administrator")),
        ),
      )
      .orderBy(asc(roles.name)),
    db
      .selectDistinct({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          eq(users.organizationId, context.organizationId),
          eq(users.status, "active"),
          isNull(users.deletedAt),
          inArray(sql`lower(${roles.slug})`, [...brokerIdTargetRoleSlugs]),
          not(ilike(roles.name, "%agent%")),
          notExists(
            db
              .select({ id: userRoles.userId })
              .from(userRoles)
              .innerJoin(roles, eq(userRoles.roleId, roles.id))
              .where(
                and(
                  eq(userRoles.userId, users.id),
                  eq(roles.organizationId, context.organizationId),
                  superAdministratorRole,
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(users.lastName), asc(users.firstName)),
    db
      .selectDistinct({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          eq(users.organizationId, context.organizationId),
          eq(users.status, "active"),
          isNull(users.deletedAt),
          ilike(roles.name, "%agent%"),
        ),
      ),
  ]);
  const agentIds = new Set(agentRows.map((agent) => agent.id));

  return {
    rows: [...grouped.values()].map((user) => ({
      ...user,
      dataScope: dataScopeOf(user.id, user.roles),
      documents: documentsByUser.get(user.id) ?? [],
    })),
    roles: roleRows,
    brokers: brokerRows.filter((broker) => !agentIds.has(broker.id)),
  };
}

export async function getUserDocumentsWorkspace(userId: string) {
  const context = await requirePermission("users.manage");
  if (!canManageUsers(context)) return null;
  const [user] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      status: users.status,
    })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.organizationId, context.organizationId),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!user) return null;

  const [roleRows, documentRows] = await Promise.all([
    db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, userId), eq(roles.organizationId, context.organizationId)))
      .orderBy(asc(roles.name)),
    db
      .select({
        id: documents.id,
        name: documents.name,
        documentType: documents.documentType,
        mimeType: documents.mimeType,
        fileSizeBytes: documents.fileSizeBytes,
        createdAt: documents.createdAt,
        validFrom: documents.validFrom,
        validUntil: documents.validUntil,
        certificateNumber: documents.certificateNumber,
      })
      .from(documents)
      .where(
        and(eq(documents.organizationId, context.organizationId), eq(documents.userId, userId)),
      )
      .orderBy(desc(documents.createdAt)),
  ]);

  return {
    user: { ...user, roles: roleRows.map((role) => role.name) },
    documents: documentRows,
  };
}

export async function getUserDocumentFileRecord(id: string) {
  const context = await requirePermission("users.manage");
  if (!canManageUsers(context)) return null;
  const [record] = await db
    .select({
      name: documents.name,
      storageKey: documents.storageKey,
      mimeType: documents.mimeType,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, id),
        eq(documents.organizationId, context.organizationId),
        not(isNull(documents.userId)),
      ),
    )
    .limit(1);
  return record ?? null;
}

export async function listRoles() {
  const context = await requirePermission("roles.manage");
  const [roleRows, permissionRows, grants] = await Promise.all([
    db
      .select()
      .from(roles)
      .where(eq(roles.organizationId, context.organizationId))
      .orderBy(asc(roles.name)),
    db.select().from(permissions).orderBy(asc(permissions.module), asc(permissions.key)),
    db
      .select({
        roleId: rolePermissions.roleId,
        permissionId: rolePermissions.permissionId,
      })
      .from(rolePermissions)
      .innerJoin(
        roles,
        and(eq(rolePermissions.roleId, roles.id), eq(roles.organizationId, context.organizationId)),
      ),
  ]);
  return { roles: roleRows, permissions: permissionRows, grants };
}

/** Each role with its own commission rate and member count, and the role-under-role links, for Settings → Commissions. */
export async function listRoleCommissions() {
  const context = await requirePermission("roles.manage");
  const [roleRows, links] = await Promise.all([
    db
      .select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        commissionRate: roles.commissionRate,
        members: sql<number>`(select count(*)::int from ${userRoles}
          inner join ${users} on ${users.id} = ${userRoles.userId}
          where ${userRoles.roleId} = ${roles.id} and ${users.deletedAt} is null)`,
      })
      .from(roles)
      .where(eq(roles.organizationId, context.organizationId))
      .orderBy(asc(roles.name)),
    db
      .select({
        id: commissionLinks.id,
        roleId: commissionLinks.roleId,
        parentRoleId: commissionLinks.parentRoleId,
        sellerRate: commissionLinks.sellerRate,
        parentRate: commissionLinks.parentRate,
      })
      .from(commissionLinks)
      .where(eq(commissionLinks.organizationId, context.organizationId)),
  ]);
  return { roles: roleRows, links };
}

/** Soft-deleted accounts, newest first, for Settings → Archived users. */
export async function listDeletedUsers() {
  const context = await requirePermission("users.restore");
  if (!canManageUsers(context)) return [];
  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(and(eq(users.organizationId, context.organizationId), not(isNull(users.deletedAt))))
    .orderBy(desc(users.deletedAt));
}
