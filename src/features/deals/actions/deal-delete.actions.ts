"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  automationEnrollments,
  deals,
  dealStageChangeRequests,
  tasks,
} from "@/db/schema";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import { logError } from "@/lib/logger";
import {
  databaseFailure,
  failure,
  notFoundFailure,
  success,
  validationFailureFromZod,
  type ActionResult,
} from "@/lib/types/action-result";
import { conflict, outOfScope } from "@/lib/errors";
import { resolveMoveRole } from "../lib/stage-transitions";
import { dealDeleteSchema } from "../schemas/deal.schema";

// Table names are explicit: drizzle drops them in single-table selects, making `id` ambiguous.
const hasLivePayment = sql<boolean>`exists (select 1 from "bills" b join "payments" p on p."bill_id" = b."id"
  where b."deal_id" = "deals"."id" and p."deleted_at" is null)`;
const holdsInventory = sql<boolean>`(exists (select 1 from "units" u where u."reserved_deal_id" = "deals"."id")
  or exists (select 1 from "parking_slots" s where s."reserved_deal_id" = "deals"."id"))`;
// The lead would drop off the pipeline with no opportunity left.
const isLeadsOnlyDeal = sql<boolean>`exists (select 1 from "deal_contacts" dc
  join "contacts" c on c."id" = dc."contact_id"
  where dc."deal_id" = "deals"."id" and dc."is_primary" and c."deleted_at" is null
  and not exists (select 1 from "deal_contacts" dc2 join "deals" d2 on d2."id" = dc2."deal_id"
    where dc2."contact_id" = dc."contact_id" and d2."id" <> "deals"."id" and d2."deleted_at" is null))`;
const leadContactId = sql<string | null>`(select dc."contact_id" from "deal_contacts" dc
  where dc."deal_id" = "deals"."id" and dc."is_primary" limit 1)`;

/** Soft-deletes one opportunity that holds no money or inventory and is not the lead's last one. */
export async function deleteDeal(input: unknown): Promise<ActionResult<{ id: string }>> {
  const context = await requirePermission("deals.delete");
  const parsed = dealDeleteSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const { dealId } = parsed.data;
  if (!(await canAccessResource(context, { type: "deal", id: dealId })))
    return notFoundFailure("Opportunity");
  const role = resolveMoveRole(context.roles);

  try {
    const outcome = await db.transaction(async (tx) => {
      const [deal] = await tx
        .select({
          title: deals.title,
          dealCode: deals.dealCode,
          status: deals.status,
          primaryAgentUserId: deals.primaryAgentUserId,
          brokerUserId: deals.brokerUserId,
          deletedAt: deals.deletedAt,
        })
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.organizationId, context.organizationId)))
        .limit(1)
        .for("update");
      if (!deal || deal.deletedAt) return { kind: "missing" as const };
      if (
        (role === "agent" && deal.primaryAgentUserId !== context.userId) ||
        (role === "broker" && deal.brokerUserId !== context.userId)
      )
        return { kind: "scope" as const, message: "You can only delete your own opportunities." };
      if (deal.status === "won")
        return { kind: "blocked" as const, message: "Won opportunities can't be deleted." };
      const [state] = await tx
        .select({
          hasLivePayment,
          holdsInventory,
          isLeadsOnlyDeal,
          contactId: leadContactId,
        })
        .from(deals)
        .where(eq(deals.id, dealId));
      if (state?.hasLivePayment)
        return {
          kind: "blocked" as const,
          message: "This opportunity has payments. Remove them in Billing first.",
        };
      if (state?.holdsInventory)
        return {
          kind: "blocked" as const,
          message: "This opportunity holds units or parking. Release them first.",
        };
      if (state?.isLeadsOnlyDeal)
        return {
          kind: "blocked" as const,
          message: "This is the contact's only opportunity. Archive the contact instead.",
        };

      const now = new Date();
      await tx
        .update(deals)
        .set({ deletedAt: now, updatedBy: context.userId, updatedAt: now })
        .where(and(eq(deals.id, dealId), isNull(deals.deletedAt)));
      // Nobody works a deleted opportunity: close its open tasks, sequences and approval requests.
      await tx
        .update(tasks)
        .set({ status: "cancelled", updatedAt: now })
        .where(and(eq(tasks.dealId, dealId), inArray(tasks.status, ["todo", "in_progress"])));
      await tx
        .update(automationEnrollments)
        .set({ status: "cancelled", completedAt: now })
        .where(
          and(eq(automationEnrollments.dealId, dealId), eq(automationEnrollments.status, "active")),
        );
      await tx
        .update(dealStageChangeRequests)
        .set({ status: "cancelled", decidedBy: context.userId, decidedAt: now, updatedAt: now })
        .where(
          and(
            eq(dealStageChangeRequests.dealId, dealId),
            eq(dealStageChangeRequests.status, "pending"),
          ),
        );
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "deal.deleted",
        summary: `${deal.title} was deleted.`,
        dealId,
        contactId: state?.contactId ?? null,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "deal",
        entityId: dealId,
        oldValues: { deletedAt: null, dealCode: deal.dealCode },
        newValues: { deletedAt: now.toISOString() },
      });
      return { kind: "deleted" as const, contactId: state?.contactId ?? null };
    });

    if (outcome.kind === "missing") return notFoundFailure("Opportunity");
    if (outcome.kind === "scope") return failure(outOfScope(outcome.message));
    if (outcome.kind === "blocked") return failure(conflict(outcome.message));
    revalidatePath("/pipeline");
    revalidatePath("/pipeline/list");
    revalidatePath(`/deals/${dealId}`);
    if (outcome.contactId) revalidatePath(`/contacts/${outcome.contactId}`);
    return success({ id: dealId });
  } catch (error) {
    logError("Opportunity delete failed", error, { dealId });
    return databaseFailure("Couldn't delete the opportunity. Try again.");
  }
}
