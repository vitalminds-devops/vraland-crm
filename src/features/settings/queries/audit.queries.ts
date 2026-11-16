import "server-only";

import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";

/** Rows-per-page options offered by the screen. */
export const AUDIT_PAGE_SIZES = [25, 50, 100] as const;

export type AuditLogFilters = {
  page: number;
  pageSize?: number;
  /** Free text over action, entity type, entity id and actor name/email. */
  search?: string;
  action?: string;
  entityType?: string;
  actorUserId?: string;
  /** Inclusive ISO day (`YYYY-MM-DD`), interpreted at local midnight. */
  from?: string;
  /** Inclusive ISO day, interpreted as the end of that day. */
  to?: string;
};

export type AuditLogRow = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: Date;
  actorUserId: string | null;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorEmail: string | null;
};

export type AuditLogFacets = {
  actions: string[];
  entityTypes: string[];
  actors: { id: string; name: string; email: string }[];
};

function startOfDay(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function endOfDay(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function isAuditPageSize(value: number): boolean {
  return (AUDIT_PAGE_SIZES as readonly number[]).includes(value);
}

export async function listAuditLogs(filters: AuditLogFilters) {
  const context = await requirePermission("settings.audit");

  const page = Number.isFinite(filters.page) && filters.page > 0 ? filters.page : 1;
  const pageSize = isAuditPageSize(filters.pageSize ?? 0) ? filters.pageSize! : AUDIT_PAGE_SIZES[0];
  const offset = (page - 1) * pageSize;

  const search = filters.search?.trim();
  const matchingActors = search
    ? db
        .select({ id: users.id })
        .from(users)
        .where(
          or(
            ilike(users.firstName, `%${search}%`),
            ilike(users.lastName, `%${search}%`),
            ilike(users.email, `%${search}%`),
          ),
        )
    : undefined;

  const where = and(
    eq(auditLogs.organizationId, context.organizationId),
    filters.action ? eq(auditLogs.action, filters.action) : undefined,
    filters.entityType ? eq(auditLogs.entityType, filters.entityType) : undefined,
    filters.actorUserId ? eq(auditLogs.actorUserId, filters.actorUserId) : undefined,
    startOfDay(filters.from) ? gte(auditLogs.occurredAt, startOfDay(filters.from)!) : undefined,
    endOfDay(filters.to) ? lte(auditLogs.occurredAt, endOfDay(filters.to)!) : undefined,
    search
      ? or(
          ilike(auditLogs.action, `%${search}%`),
          ilike(auditLogs.entityType, `%${search}%`),
          sql`${auditLogs.entityId}::text ilike ${`%${search}%`}`,
          inArray(auditLogs.actorUserId, matchingActors!),
        )
      : undefined,
  );

  const [rows, totalRows, actionRows, entityRows, actorRows] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        oldValues: auditLogs.oldValues,
        newValues: auditLogs.newValues,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        occurredAt: auditLogs.occurredAt,
        actorUserId: auditLogs.actorUserId,
        actorFirstName: users.firstName,
        actorLastName: users.lastName,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ value: count() }).from(auditLogs).where(where),
    db
      .selectDistinct({ value: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, context.organizationId))
      .orderBy(auditLogs.action),
    db
      .selectDistinct({ value: auditLogs.entityType })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, context.organizationId))
      .orderBy(auditLogs.entityType),
    db
      .selectDistinct({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(auditLogs)
      .innerJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(eq(auditLogs.organizationId, context.organizationId))
      .orderBy(users.firstName, users.lastName),
  ]);

  const total = totalRows[0]?.value ?? 0;

  return {
    rows: rows as AuditLogRow[],
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    facets: {
      actions: actionRows.map((row) => row.value).filter(Boolean),
      entityTypes: entityRows.map((row) => row.value).filter(Boolean),
      actors: actorRows.map((row) => ({
        id: row.id,
        name: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email,
        email: row.email,
      })),
    } satisfies AuditLogFacets,
  };
}
