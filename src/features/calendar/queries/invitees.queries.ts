import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Of `ids`, the ones that are active users of the organization; with no `ids`, every active
 * user (an invite to everyone). Callers check permissions first.
 */
export async function activeUserIds(organizationId: string, ids?: string[]) {
  if (ids && !ids.length) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.status, "active"),
        isNull(users.deletedAt),
        ids ? inArray(users.id, ids) : undefined,
      ),
    );
  return rows.map((row) => row.id);
}
