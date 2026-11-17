import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { users } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * When a user comes back (restored or reactivated): locks their row and, if the broker they report
 * to is no longer active in the organization, returns the change that drops that link, ready to
 * spread into the user update and its audit row. Otherwise both sides are empty.
 */
export async function staleBrokerChange(tx: Tx, organizationId: string, userId: string) {
  const [row] = await tx
    .select({
      brokerId: users.brokerId,
      brokerActive: sql<boolean>`exists (select 1 from "users" b where b."id" = ${users.brokerId}
        and b."organization_id" = ${organizationId} and b."status" = 'active' and b."deleted_at" is null)`,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)))
    .for("update");
  if (!row?.brokerId || row.brokerActive) return { oldValues: {}, newValues: {} };
  return { oldValues: { brokerId: row.brokerId }, newValues: { brokerId: null } };
}
