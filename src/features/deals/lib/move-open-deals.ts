import { and, eq, inArray, isNull } from "drizzle-orm";

import type { db } from "@/db";
import { auditLogs, dealAgents, dealContacts, deals } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Hands a contact's open opportunities to its new agent and/or broker, so access and commissions
 * follow the contact. Won, lost and cancelled ones keep whoever earned them.
 * Leave `primaryAgentUserId` out to change only the broker.
 */
export async function moveOpenDeals(
  tx: Tx,
  input: {
    organizationId: string;
    actorUserId: string;
    contactId: string;
    primaryAgentUserId?: string | null;
    brokerUserId: string | null;
  },
) {
  const { organizationId, actorUserId, contactId, ...owner } = input;
  const open = await tx
    .select({
      id: deals.id,
      primaryAgentUserId: deals.primaryAgentUserId,
      brokerUserId: deals.brokerUserId,
    })
    .from(deals)
    .innerJoin(
      dealContacts,
      and(
        eq(dealContacts.dealId, deals.id),
        eq(dealContacts.contactId, contactId),
        eq(dealContacts.isPrimary, true),
      ),
    )
    .where(
      and(
        eq(deals.organizationId, organizationId),
        eq(deals.status, "open"),
        isNull(deals.deletedAt),
      ),
    );
  if (!open.length) return 0;
  const ids = open.map((deal) => deal.id);

  await tx
    .update(deals)
    .set({ ...owner, updatedBy: actorUserId, updatedAt: new Date() })
    .where(and(inArray(deals.id, ids), eq(deals.organizationId, organizationId)));
  if (owner.primaryAgentUserId !== undefined) {
    await tx
      .delete(dealAgents)
      .where(and(inArray(dealAgents.dealId, ids), eq(dealAgents.role, "primary")));
    if (owner.primaryAgentUserId)
      await tx
        .insert(dealAgents)
        .values(
          ids.map((dealId) => ({ dealId, userId: owner.primaryAgentUserId!, role: "primary" })),
        )
        .onConflictDoNothing();
  }
  await tx.insert(auditLogs).values(
    open.map((deal) => ({
      organizationId,
      actorUserId,
      action: "update",
      entityType: "deal",
      entityId: deal.id,
      oldValues:
        owner.primaryAgentUserId === undefined
          ? { brokerUserId: deal.brokerUserId }
          : { primaryAgentUserId: deal.primaryAgentUserId, brokerUserId: deal.brokerUserId },
      newValues: owner,
    })),
  );
  return ids.length;
}
