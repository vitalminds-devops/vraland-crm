import "server-only";
import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { contactAssignmentHistory, contactBrokerHistory, users } from "@/db/schema";
import { InactiveAssigneeError, lockActiveAssignees } from "@/lib/permissions/active-assignees";
import { moveOpenDeals } from "@/features/deals/lib/move-open-deals";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function isActive(tx: Tx, organizationId: string, userId: string) {
  try {
    await lockActiveAssignees(tx, organizationId, [userId]);
    return true;
  } catch (error) {
    if (error instanceof InactiveAssigneeError) return false;
    throw error;
  }
}

/**
 * Who works a contact being restored. User handover skips archived contacts, so the agent or
 * broker may have left: a new agent (already checked against eligibility and scope) takes over,
 * with their broker, as on any assignment. Returns null when the agent has left and none was
 * given. Moves the contact's open deals and records history; the caller writes the contact row.
 * Throws InactiveAssigneeError when the new agent or the broker to set is not active.
 */
export async function restoredOwner(
  tx: Tx,
  input: {
    organizationId: string;
    actorUserId: string;
    contactId: string;
    assignedUserId: string | null;
    brokerUserId: string | null;
    newAgentId?: string | null;
  },
) {
  const { organizationId, actorUserId, contactId, assignedUserId, brokerUserId } = input;
  const agentId = input.newAgentId || assignedUserId;
  if (!agentId) return null;
  if (input.newAgentId) await lockActiveAssignees(tx, organizationId, [agentId]);
  else if (!(await isActive(tx, organizationId, agentId))) return null;

  const agentChanged = agentId !== assignedUserId;
  let broker = brokerUserId;
  if (agentChanged || (broker && !(await isActive(tx, organizationId, broker)))) {
    const [agent] = await tx
      .select({ brokerId: users.brokerId })
      .from(users)
      .where(eq(users.id, agentId))
      .limit(1);
    broker = agent?.brokerId ?? agentId;
    if (broker !== brokerUserId) await lockActiveAssignees(tx, organizationId, [broker]);
  }

  if (agentChanged)
    await tx.insert(contactAssignmentHistory).values({
      contactId,
      fromUserId: assignedUserId,
      toUserId: agentId,
      changedBy: actorUserId,
      reason: "Contact restored",
    });
  if (broker !== brokerUserId)
    await tx.insert(contactBrokerHistory).values({
      contactId,
      fromBrokerUserId: brokerUserId,
      toBrokerUserId: broker,
      changedBy: actorUserId,
      reason: "Contact restored",
      changedAt: new Date(),
    });
  if (agentChanged || broker !== brokerUserId)
    await moveOpenDeals(tx, {
      organizationId,
      actorUserId,
      contactId,
      ...(agentChanged ? { primaryAgentUserId: agentId } : {}),
      brokerUserId: broker,
    });
  return { assignedUserId: agentId, brokerUserId: broker };
}
