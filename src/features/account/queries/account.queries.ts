import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { roles, userRoles, users } from "@/db/schema";
import { requireAuthorizationContext } from "@/lib/permissions/authorization";

const broker = alias(users, "broker");

export async function getMyProfile() {
  const context = await requireAuthorizationContext();
  const [user] = await db
    .select({
      id: users.id,
      avatarUrl: users.avatarUrl,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      brokerFirstName: broker.firstName,
      brokerLastName: broker.lastName,
    })
    .from(users)
    .leftJoin(broker, eq(users.brokerId, broker.id))
    .where(
      and(
        eq(users.id, context.userId),
        eq(users.organizationId, context.organizationId),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!user) return null;
  const roleRows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, context.userId))
    .orderBy(asc(roles.name));
  return { ...user, roles: roleRows.map((role) => role.name) };
}
