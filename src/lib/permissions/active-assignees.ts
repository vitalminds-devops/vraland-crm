import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { db } from "@/db";
import { users } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Thrown inside a transaction to roll it back; callers return it as a validation failure. */
export class InactiveAssigneeError extends Error {
  constructor() {
    super("Select an active agent.");
  }
}

/**
 * Locks the users about to be assigned (FOR SHARE) and confirms each is still active in the
 * organization, or throws InactiveAssigneeError. User handover locks the leaver FOR UPDATE, so an
 * assignment waits for it and then sees the new status. Call inside the transaction that writes
 * the record, and only for newly assigned users. Empty ids are ignored.
 */
export async function lockActiveAssignees(
  tx: Tx,
  organizationId: string,
  userIds: readonly (string | null | undefined)[],
) {
  // Sorted, so concurrent callers lock in the same order and cannot deadlock each other.
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))].sort();
  if (!ids.length) return;
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(users.id, ids),
        eq(users.organizationId, organizationId),
        eq(users.status, "active"),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(users.id))
    .for("share");
  if (rows.length !== ids.length) throw new InactiveAssigneeError();
}
