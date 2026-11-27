import "server-only";

import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import {
  activities,
  auditLogs,
  dealStageChangeRequests,
  dealStageHistory,
  pipelineStages,
} from "@/db/schema";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Whether the opportunity ever entered a stage that needs approval. */
export async function dealHasGatedHistory(tx: DbTransaction, dealId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: dealStageHistory.id })
    .from(dealStageHistory)
    .innerJoin(pipelineStages, eq(pipelineStages.id, dealStageHistory.toStageId))
    .where(and(eq(dealStageHistory.dealId, dealId), eq(pipelineStages.requiresApproval, true)))
    .limit(1);
  return Boolean(row);
}

/**
 * Files the move for a manager to approve. Returns the refusal when a request is already waiting,
 * or null once this one is filed.
 */
export async function requestStageApproval(
  tx: DbTransaction,
  context: { organizationId: string; userId: string },
  request: {
    dealId: string;
    title: string;
    fromStageId: string;
    toStageId: string;
    toStageName: string;
    note: string;
    /** Saved on the request so an approved "mark lost" keeps its reason. */
    lost?: { reasonId: string; notes: string };
  },
): Promise<string | null> {
  const { dealId, fromStageId, toStageId } = request;
  const [pending] = await tx
    .select({ id: dealStageChangeRequests.id })
    .from(dealStageChangeRequests)
    .where(
      and(
        eq(dealStageChangeRequests.dealId, dealId),
        eq(dealStageChangeRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (pending) return `${request.title} already has a stage change awaiting approval.`;
  await tx.insert(dealStageChangeRequests).values({
    organizationId: context.organizationId,
    dealId,
    fromStageId,
    toStageId,
    requestedBy: context.userId,
    status: "pending",
    reason: request.note.trim() || null,
    lostReasonId: request.lost?.reasonId ?? null,
    lostNotes: request.lost?.notes || null,
  });
  await tx.insert(activities).values({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    activityType: "deal.stage_change_requested",
    summary: `${request.title} was sent to ${request.toStageName} for manager approval.`,
    dealId,
    metadata: { fromStageId, toStageId, requiresApproval: true },
  });
  await tx.insert(auditLogs).values({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    action: "create",
    entityType: "deal_stage_change_request",
    entityId: dealId,
    newValues: { dealId, fromStageId, toStageId, status: "pending" },
  });
  return null;
}
