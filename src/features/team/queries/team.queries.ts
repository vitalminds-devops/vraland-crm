import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AuthorizationError, requireAuthorizationContext } from "@/lib/permissions/authorization";
import { canViewTeam } from "@/lib/permissions/policy";

/** The people whose Broker is the signed-in user, with how much each is working on. */
export async function listMyTeam() {
  const context = await requireAuthorizationContext();
  if (!canViewTeam(context)) throw new AuthorizationError();
  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      avatarUrl: users.avatarUrl,
      roleNames: sql<string | null>`(
        select string_agg(r."name", ', ' order by r."name")
        from "user_roles" ur inner join "roles" r on r."id" = ur."role_id"
        where ur."user_id" = "users"."id")`,
      leads: sql<number>`(
        select count(*)::int from "contacts" c
        where c."assigned_user_id" = "users"."id" and c."deleted_at" is null)`,
      openOpportunities: sql<number>`(
        select count(*)::int from "deals" d
        where d."primary_agent_user_id" = "users"."id"
          and d."status" = 'open' and d."deleted_at" is null)`,
    })
    .from(users)
    .where(
      and(
        eq(users.organizationId, context.organizationId),
        eq(users.brokerId, context.userId),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(users.firstName), asc(users.lastName));
}
