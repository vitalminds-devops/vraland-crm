"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activities, auditLogs, dealAgents, dealCommissions, deals, users } from "@/db/schema";
import { eligibleAgent } from "@/features/contacts/lib/assignment";
import { ActionErrorCode, outOfScope } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { InactiveAssigneeError, lockActiveAssignees } from "@/lib/permissions/active-assignees";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import { scopedAgentCondition } from "@/lib/permissions/scope";
import {
  databaseFailure,
  failure,
  failureFrom,
  notFoundFailure,
  success,
  validationFailure,
  validationFailureFromZod,
  type ActionResult,
} from "@/lib/types/action-result";

const reassignSchema = z.object({
  dealId: z.uuid(),
  agentUserId: z.uuid(),
  reason: z.string().trim().min(1, "Add a reason.").max(500),
});

/** Moves an opportunity, and on a won one its commission, to another agent. */
export async function reassignDealAgent(input: unknown): Promise<ActionResult<{ id: string }>> {
  const context = await requirePermission("deals.reassign_agent");
  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const { dealId, agentUserId, reason } = parsed.data;
  if (!(await canAccessResource(context, { type: "deal", id: dealId })))
    return notFoundFailure("Opportunity");
  // Same rule as picking the agent when the opportunity is created.
  const [agent] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      brokerId: users.brokerId,
    })
    .from(users)
    .where(
      and(
        eq(users.id, agentUserId),
        eligibleAgent(context.organizationId),
        scopedAgentCondition(context),
      ),
    )
    .limit(1);
  if (!agent) return failure(outOfScope("The selected agent is unavailable."));

  try {
    const outcome = await db.transaction(async (tx) => {
      const [deal] = await tx
        .select({
          title: deals.title,
          status: deals.status,
          amount: deals.amount,
          primaryAgentUserId: deals.primaryAgentUserId,
          brokerUserId: deals.brokerUserId,
        })
        .from(deals)
        .where(
          and(
            eq(deals.id, dealId),
            eq(deals.organizationId, context.organizationId),
            isNull(deals.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!deal) return "missing" as const;
      if (deal.primaryAgentUserId === agentUserId) return "same" as const;
      await lockActiveAssignees(tx, context.organizationId, [agentUserId]);

      // The opportunity follows the new agent's broker (or the agent, with none), as handover does,
      // so the right broker sees it, can move it and earns on it.
      const brokerUserId = agent.brokerId ?? agentUserId;
      await tx
        .update(deals)
        .set({
          primaryAgentUserId: agentUserId,
          brokerUserId,
          updatedBy: context.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(deals.id, dealId), eq(deals.organizationId, context.organizationId)));
      await tx
        .delete(dealAgents)
        .where(and(eq(dealAgents.dealId, dealId), eq(dealAgents.role, "primary")));
      await tx
        .insert(dealAgents)
        .values({ dealId, userId: agentUserId, role: "primary" })
        .onConflictDoNothing();
      // A won sale's commission (kept while it is reopened) keeps the rates it was won at: the
      // seller's share moves to the new agent and the broker's to the new broker (dropped when the
      // agent is their own broker). A deal never won has no rows, so nothing changes.
      const oldBroker =
        deal.brokerUserId && deal.brokerUserId !== deal.primaryAgentUserId
          ? deal.brokerUserId
          : null;
      if (oldBroker) {
        const brokerShares = and(
          eq(dealCommissions.dealId, dealId),
          eq(dealCommissions.userId, oldBroker),
        );
        if (brokerUserId === agentUserId) await tx.delete(dealCommissions).where(brokerShares);
        else await tx.update(dealCommissions).set({ userId: brokerUserId }).where(brokerShares);
      }
      if (deal.primaryAgentUserId)
        await tx
          .update(dealCommissions)
          .set({ userId: agentUserId })
          .where(
            and(
              eq(dealCommissions.dealId, dealId),
              eq(dealCommissions.userId, deal.primaryAgentUserId),
            ),
          );
      const name = `${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim();
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "deal.agent_reassigned",
        summary: `${deal.title} was reassigned to ${name || "another agent"}.`,
        dealId,
        metadata: { reason },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "deal",
        entityId: dealId,
        oldValues: { primaryAgentUserId: deal.primaryAgentUserId, brokerUserId: deal.brokerUserId },
        newValues: { primaryAgentUserId: agentUserId, brokerUserId, reason },
      });
      return "moved" as const;
    });
    if (outcome === "missing") return notFoundFailure("Opportunity");
    if (outcome === "same")
      return failureFrom(ActionErrorCode.INVALID_INPUT, "That agent already has it.");
  } catch (error) {
    if (error instanceof InactiveAssigneeError) return validationFailure(error.message);
    logError("Deal agent reassignment failed", error, { operation: "deal_reassign_agent" });
    return databaseFailure("The opportunity could not be reassigned because of a database error.");
  }
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/list");
  revalidatePath(`/deals/${dealId}`);
  return success({ id: dealId });
}
