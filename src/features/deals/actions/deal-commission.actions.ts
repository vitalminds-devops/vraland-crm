"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities, auditLogs, dealCommissions, deals } from "@/db/schema";
import { logError } from "@/lib/logger";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import {
  databaseFailure,
  notFoundFailure,
  success,
  validationFailure,
  validationFailureFromZod,
  type ActionResult,
} from "@/lib/types/action-result";
import { recordDealCommissions } from "../lib/record-commissions";
import { commissionRecalculationSchema } from "../schemas/deal.schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const commissionRows = (tx: Tx, dealId: string) =>
  tx
    .select({
      userId: dealCommissions.userId,
      roleName: dealCommissions.roleName,
      rate: dealCommissions.rate,
      amount: dealCommissions.amount,
    })
    .from(dealCommissions)
    .where(eq(dealCommissions.dealId, dealId));

/**
 * Replaces a won opportunity's commission with what today's Settings → Commissions rules pay its
 * current agent and broker. For setting right a commission recorded under older rules or roles.
 */
export async function recalculateCommission(
  input: unknown,
): Promise<ActionResult<{ id: string; message: string }>> {
  const context = await requirePermission("roles.manage");
  const parsed = commissionRecalculationSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const { dealId } = parsed.data;
  if (!(await canAccessResource(context, { type: "deal", id: dealId })))
    return notFoundFailure("Opportunity");

  try {
    const outcome = await db.transaction(async (tx) => {
      const [deal] = await tx
        .select({
          title: deals.title,
          status: deals.status,
          amount: deals.amount,
          agentUserId: deals.agentUserId,
          brokerUserId: deals.brokerUserId,
          expectedCommission: deals.expectedCommission,
        })
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.organizationId, context.organizationId)))
        .limit(1)
        .for("update");
      if (!deal) return { kind: "missing" as const };
      if (deal.status !== "won")
        return { kind: "refused" as const, message: "Only a won opportunity has a commission." };
      const before = await commissionRows(tx, dealId);
      await recordDealCommissions(tx, {
        organizationId: context.organizationId,
        dealId,
        amount: deal.amount,
        sellerUserId: deal.agentUserId,
        brokerUserId: deal.brokerUserId,
      });
      const after = await commissionRows(tx, dealId);
      // With no rule paying anyone the rows are gone; the expected commission says so too.
      if (!after.length)
        await tx.update(deals).set({ expectedCommission: "0.00" }).where(eq(deals.id, dealId));
      const total = after.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2);
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "deal",
        entityId: dealId,
        oldValues: { commissions: before, expectedCommission: deal.expectedCommission },
        newValues: { commissions: after, expectedCommission: total },
      });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "deal.commission_recalculated",
        summary: `${deal.title}'s commission was recalculated.`,
        dealId,
      });
      return { kind: "done" as const, paid: after.length > 0 };
    });
    if (outcome.kind === "missing") return notFoundFailure("Opportunity");
    if (outcome.kind === "refused") return validationFailure(outcome.message);
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/dashboard");
    return success({
      id: dealId,
      message: outcome.paid
        ? "Commission recalculated."
        : "Commission recalculated. No commission rule applies.",
    });
  } catch (error) {
    logError("Commission recalculation failed", error, {
      operation: "deal_commission_recalculate",
    });
    return databaseFailure("Couldn't recalculate the commission.");
  }
}
