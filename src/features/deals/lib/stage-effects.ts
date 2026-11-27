import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/db";
import {
  activities,
  auditLogs,
  dealCommissions,
  deals,
  dealStageChangeRequests,
  units,
} from "@/db/schema";
import { recordDealCommissions } from "./record-commissions";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = { organizationId: string; userId: string };

/** Notes on the opportunity which units and slots it let go of on moving back to Leads. */
export async function recordUnitsReleased(
  tx: DbTransaction,
  actor: Actor,
  deal: { id: string; title: string; unitIds: string[]; parkingSlotIds: string[] },
) {
  const released = deal.unitIds.length
    ? await tx.select({ code: units.identifier }).from(units).where(inArray(units.id, deal.unitIds))
    : [];
  const names = [
    ...released.map((unit) => `Unit ${unit.code}`),
    ...(deal.parkingSlotIds.length
      ? [
          `${deal.parkingSlotIds.length} parking ${deal.parkingSlotIds.length === 1 ? "slot" : "slots"}`,
        ]
      : []),
  ];
  await tx.insert(activities).values({
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    activityType: "deal.units_released",
    summary: `${deal.title} let go of ${names.join(", ")} on moving back to Leads.`,
    dealId: deal.id,
    metadata: { unitIds: deal.unitIds, parkingSlotIds: deal.parkingSlotIds },
  });
}

type StageState = { stageId: string; stageName: string; status: string };

/** Audits a move that leaves Won, Lost or Cancelled: a reopen, or a changed outcome. */
export async function recordOutcomeChange(
  tx: DbTransaction,
  actor: Actor,
  move: { dealId: string; note: string; from: StageState; to: StageState },
) {
  const { from, to } = move;
  const leftOutcome =
    (from.status === "won" || from.status === "cancelled" || from.status === "lost") &&
    to.status !== from.status;
  if (!leftOutcome) return;
  await tx.insert(auditLogs).values({
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action: to.status === "lost" || to.status === "cancelled" ? "outcome_changed" : "reopen",
    entityType: "deal",
    entityId: move.dealId,
    oldValues: from,
    newValues: { ...to, note: move.note.trim() || null },
  });
}

/**
 * The commission is set by the first win and kept through a reopen, so a price changed in
 * Billing meanwhile never changes it; only an opportunity that ends lost or cancelled drops it.
 */
export async function settleCommissions(
  tx: DbTransaction,
  organizationId: string,
  deal: {
    id: string;
    amount: string | null;
    agentUserId: string | null;
    brokerUserId: string | null;
  },
  fromStatus: string,
  toStatus: string,
) {
  if (toStatus === "won" && fromStatus !== "won") {
    const [earned] = await tx
      .select({ total: sql<string | null>`sum(${dealCommissions.amount})` })
      .from(dealCommissions)
      .where(eq(dealCommissions.dealId, deal.id));
    if (earned?.total === null || earned?.total === undefined)
      await recordDealCommissions(tx, {
        organizationId,
        dealId: deal.id,
        amount: deal.amount,
        sellerUserId: deal.agentUserId,
        brokerUserId: deal.brokerUserId,
      });
    else
      await tx.update(deals).set({ expectedCommission: earned.total }).where(eq(deals.id, deal.id));
  } else if (toStatus === "lost" || toStatus === "cancelled")
    await tx.delete(dealCommissions).where(eq(dealCommissions.dealId, deal.id));
}

/** A request left open by a move is out of date; close it so the card stops showing it. */
export async function cancelOpenRequests(tx: DbTransaction, userId: string, dealId: string) {
  await tx
    .update(dealStageChangeRequests)
    .set({ status: "cancelled", decidedBy: userId, decidedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(dealStageChangeRequests.dealId, dealId),
        eq(dealStageChangeRequests.status, "pending"),
      ),
    );
}
