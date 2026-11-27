"use server";

import { toAmount } from "@/lib/utils/money";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { nextRecordCode } from "@/lib/record-codes";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  contacts,
  dealAgents,
  dealContacts,
  deals,
  dealStageChangeRequests,
  dealStageHistory,
  developments,
  lostReasons,
  pipelineStages,
  users,
} from "@/db/schema";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import { eligibleAgent } from "@/features/contacts/lib/assignment";
import { formatContactName } from "@/features/contacts/lib/helpers";
import { InactiveAssigneeError, lockActiveAssignees } from "@/lib/permissions/active-assignees";
import { scopedAgentCondition } from "@/lib/permissions/scope";
import { hasPermission } from "@/lib/permissions/policy";
import { dealTitleFor } from "../lib/deal-label";
import { applyStageChange, RequestAlreadyDecided } from "../lib/apply-stage-change";
import { canStartDealInStage } from "../lib/stage-transitions";
import {
  contactDealSchema,
  lostDealSchema,
  stageApprovalSchema,
  type ContactDealInput,
} from "../schemas/deal.schema";
import { logError } from "@/lib/logger";
import { buildChangeSet, isEmptyChangeSet } from "@/lib/audit/redact";
import {
  databaseFailure,
  failure,
  failureFrom,
  notFoundFailure,
  success,
  validationFailure,
  validationFailureFromZod,
  type ActionErrorResult,
  type ActionResult,
} from "@/lib/types/action-result";
import { ActionErrorCode, conflict, outOfScope, permissionDenied } from "@/lib/errors";

export type DealActionResult = ActionResult<{
  id: string;
  approvalRequested?: true;
  message?: string;
}>;

export async function createDealForContact(
  contactId: string,
  agentUserId: string | null,
  input: ContactDealInput,
): Promise<DealActionResult> {
  const context = await requirePermission("deals.create");
  const parsed = contactDealSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;
  // An approved contact already got its deal when it was saved; fill that one in instead of adding a second.
  const [opened] = await db
    .select({ id: deals.id })
    .from(deals)
    .innerJoin(
      dealContacts,
      and(eq(dealContacts.dealId, deals.id), eq(dealContacts.contactId, contactId)),
    )
    .where(and(eq(deals.organizationId, context.organizationId), isNull(deals.deletedAt)))
    .limit(1);
  if (opened) return saveDealForContact(contactId, agentUserId, input);
  const [stage] = await db
    .select()
    .from(pipelineStages)
    .where(
      and(
        eq(pipelineStages.id, v.stageId),
        eq(pipelineStages.organizationId, context.organizationId),
        eq(pipelineStages.isActive, true),
      ),
    )
    .limit(1);
  if (!stage) return failure(outOfScope("The selected pipeline stage is unavailable."));
  const start = canStartDealInStage(stage);
  if (!start.allowed) return failureFrom(ActionErrorCode.INVALID_INPUT, start.message);
  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      brokerUserId: contacts.brokerUserId,
      preferredDevelopmentId: contacts.preferredDevelopmentId,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, context.organizationId)))
    .limit(1);
  if (!contact) return failure(outOfScope("The selected contact is unavailable."));
  if (!(await canAccessResource(context, { type: "contact", id: contactId })))
    return notFoundFailure("Contact");
  const [development] = contact.preferredDevelopmentId
    ? await db
        .select({ id: developments.id, name: developments.name })
        .from(developments)
        .where(
          and(
            eq(developments.id, contact.preferredDevelopmentId),
            eq(developments.organizationId, context.organizationId),
          ),
        )
        .limit(1)
    : [];
  const developmentId = development?.id ?? null;
  const title = dealTitleFor(formatContactName(contact), development?.name ?? null);
  if (agentUserId) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, agentUserId),
          eligibleAgent(context.organizationId),
          scopedAgentCondition(context),
        ),
      )
      .limit(1);
    if (!row) return failure(outOfScope("The selected agent is unavailable."));
  }
  try {
    const id = await db.transaction(async (tx) => {
      await lockActiveAssignees(tx, context.organizationId, [agentUserId, contact.brokerUserId]);
      const [row] = await tx
        .insert(deals)
        .values({
          organizationId: context.organizationId,
          dealCode: await nextRecordCode(tx, context.organizationId, "opportunity"),
          title,
          dealType: v.dealType,
          stageId: v.stageId,
          developmentId,
          agentUserId,
          brokerUserId: contact.brokerUserId,
          amount: toAmount(v.amount),
          expectedCommission: toAmount(v.expectedCommission),
          probability: stage.defaultProbability,
          expectedCloseDate: v.expectedCloseDate,
          createdBy: context.userId,
          updatedBy: context.userId,
        })
        .returning({ id: deals.id });
      await tx.insert(dealContacts).values({
        dealId: row.id,
        contactId,
        role: v.dealType === "sale" ? "buyer" : "tenant",
        isPrimary: true,
      });
      if (agentUserId)
        await tx
          .insert(dealAgents)
          .values({
            dealId: row.id,
            userId: agentUserId,
            role: "primary",
          })
          .onConflictDoNothing();
      await tx.insert(dealStageHistory).values({
        dealId: row.id,
        toStageId: v.stageId,
        changedBy: context.userId,
        note: "Opportunity created",
      });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "deal.created",
        summary: `${title} was created in ${stage.name}.`,
        dealId: row.id,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "deal",
        entityId: row.id,
        newValues: { title, stageId: v.stageId, contactId, developmentId },
      });
      return row.id;
    });
    revalidatePath("/pipeline");
    revalidatePath("/pipeline/list");
    revalidatePath("/contacts");
    revalidatePath(`/contacts/${contactId}`);
    return success({ id });
  } catch (error) {
    if (error instanceof InactiveAssigneeError) return validationFailure(error.message);
    logError("Deal creation failed", error, { operation: "deal_create_for_contact" });
    return databaseFailure("Couldn't create the opportunity because of a database error.");
  }
}

export async function saveDealForContact(
  contactId: string,
  agentUserId: string | null,
  input: ContactDealInput,
): Promise<DealActionResult> {
  const context = await requirePermission("contacts.update");
  const [existing] = await db
    .select({
      id: deals.id,
      stageId: deals.stageId,
    })
    .from(deals)
    .innerJoin(
      dealContacts,
      and(eq(dealContacts.dealId, deals.id), eq(dealContacts.contactId, contactId)),
    )
    .where(and(eq(deals.organizationId, context.organizationId), isNull(deals.deletedAt)))
    .orderBy(asc(deals.createdAt))
    .limit(1);
  if (!existing) return createDealForContact(contactId, agentUserId, input);

  if (!hasPermission(context, "deals.update")) return failure(permissionDenied());
  if (!(await canAccessResource(context, { type: "deal", id: existing.id })))
    return notFoundFailure("Opportunity");
  const parsed = contactDealSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;
  // The contact form never changes the opportunity's agent: open ones follow the contact's agent
  // (moveOpenDeals) and anything else goes through reassignDealAgent.
  const [contactRow] = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      preferredDevelopmentId: contacts.preferredDevelopmentId,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, context.organizationId)))
    .limit(1);
  if (!contactRow) return failure(outOfScope("The selected contact is unavailable."));
  const [development] = contactRow.preferredDevelopmentId
    ? await db
        .select({ id: developments.id, name: developments.name })
        .from(developments)
        .where(
          and(
            eq(developments.id, contactRow.preferredDevelopmentId),
            eq(developments.organizationId, context.organizationId),
          ),
        )
        .limit(1)
    : [];
  const developmentId = development?.id ?? null;
  const title = dealTitleFor(formatContactName(contactRow), development?.name ?? null);
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          title: deals.title,
          dealType: deals.dealType,
          developmentId: deals.developmentId,
          amount: deals.amount,
          expectedCommission: deals.expectedCommission,
          expectedCloseDate: deals.expectedCloseDate,
          status: deals.status,
          earned: sql<boolean>`exists (select 1 from "deal_commissions" dc where dc."deal_id" = ${existing.id})`,
        })
        .from(deals)
        .where(and(eq(deals.id, existing.id), eq(deals.organizationId, context.organizationId)))
        .limit(1)
        .for("update");
      if (!before) throw new Error("Opportunity not found");
      // A won sale's amount and commission were settled when it was won; the contact form can't
      // change them. The commission stays settled while a won deal is reopened.
      const won = before.status === "won";
      const amount = won ? before.amount : toAmount(v.amount);
      const expectedCommission =
        won || before.earned ? before.expectedCommission : toAmount(v.expectedCommission);
      await tx
        .update(deals)
        .set({
          title,
          dealType: v.dealType,
          developmentId,
          amount,
          expectedCommission,
          expectedCloseDate: v.expectedCloseDate,
          updatedBy: context.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(deals.id, existing.id), eq(deals.organizationId, context.organizationId)));
      await tx
        .update(dealContacts)
        .set({ role: v.dealType === "sale" ? "buyer" : "tenant" })
        .where(
          and(
            eq(dealContacts.dealId, existing.id),
            eq(dealContacts.contactId, contactId),
            eq(dealContacts.isPrimary, true),
          ),
        );
      const changes = buildChangeSet(
        {
          title: before.title,
          dealType: before.dealType,
          developmentId: before.developmentId,
          amount: before.amount,
          expectedCommission: before.expectedCommission,
          expectedCloseDate: before.expectedCloseDate,
        },
        {
          title,
          dealType: v.dealType,
          developmentId,
          amount,
          expectedCommission,
          expectedCloseDate: v.expectedCloseDate,
        },
      );
      // A save that changed nothing is not an audit event.
      if (!isEmptyChangeSet(changes))
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "update",
          entityType: "deal",
          entityId: existing.id,
          oldValues: changes.oldValues,
          newValues: { ...changes.newValues, source: "contact_form" },
        });
    });
  } catch (error) {
    logError("Deal update failed", error, { operation: "deal_update" });
    return databaseFailure("Couldn't update the opportunity because of a database error.");
  }
  if (existing.stageId !== v.stageId) {
    if (!hasPermission(context, "deals.change_stage")) return failure(permissionDenied());
    const moved = await applyStageChange(context, {
      dealId: existing.id,
      stageId: v.stageId,
      note: "Stage changed from contact form",
    });
    if (!moved.success) return moved;
  }
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/list");
  revalidatePath(`/deals/${existing.id}`);
  revalidatePath(`/contacts/${contactId}`);
  return success({ id: existing.id });
}

/** Any move but Lost, which goes through `markDealLost` so a loss reason is always recorded. */
export async function changeDealStage(input: unknown): Promise<DealActionResult> {
  const context = await requirePermission("deals.change_stage");
  return applyStageChange(context, input);
}

export async function approveStageChange(input: unknown): Promise<DealActionResult> {
  const context = await requirePermission("deals.approve_stage_change");
  const parsed = stageApprovalSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const { requestId, note } = parsed.data;
  const [request] = await db
    .select()
    .from(dealStageChangeRequests)
    .where(
      and(
        eq(dealStageChangeRequests.id, requestId),
        eq(dealStageChangeRequests.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  if (!request) return notFoundFailure("Approval request");
  if (request.status !== "pending")
    return failure(conflict("That request has already been decided."));
  if (request.requestedBy === context.userId)
    return failure(permissionDenied("You cannot approve your own stage change request."));
  if (!(await canAccessResource(context, { type: "deal", id: request.dealId })))
    return notFoundFailure("Opportunity");
  const moved = await applyStageChange(
    context,
    {
      dealId: request.dealId,
      stageId: request.toStageId,
      note: note || "Stage change approved",
    },
    {
      allowTerminalOutcome: true,
      afterMove: async (tx) => {
        const decided = await tx
          .update(dealStageChangeRequests)
          .set({
            status: "approved",
            decidedBy: context.userId,
            decidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(dealStageChangeRequests.id, requestId),
              eq(dealStageChangeRequests.organizationId, context.organizationId),
              eq(dealStageChangeRequests.status, "pending"),
            ),
          )
          .returning({ id: dealStageChangeRequests.id });
        if (!decided.length) throw new RequestAlreadyDecided();
        if (request.lostReasonId || request.lostNotes)
          await tx
            .update(deals)
            .set({
              lostReasonId: request.lostReasonId,
              lostNotes: request.lostNotes,
              updatedBy: context.userId,
              updatedAt: new Date(),
            })
            .where(eq(deals.id, request.dealId));
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "approve",
          entityType: "deal_stage_change_request",
          entityId: requestId,
          newValues: { status: "approved", note: note || null },
        });
      },
    },
  );
  if (!moved.success) return moved;
  revalidatePath("/dashboard");
  revalidatePath(`/deals/${request.dealId}`);
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/approvals");
  return success({ id: request.dealId });
}

export async function rejectStageChange(input: unknown): Promise<DealActionResult> {
  const context = await requirePermission("deals.approve_stage_change");
  const parsed = stageApprovalSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const { requestId, note } = parsed.data;
  if (!note.trim()) return validationFailure("A reason is required when rejecting a stage change.");
  const request = await decideRequest(context, requestId, "rejected", note);
  if (!("dealId" in request)) return request;
  return success({ id: request.dealId });
}

export async function markDealLost(input: unknown): Promise<DealActionResult> {
  const context = await requirePermission("deals.change_stage");
  const parsed = lostDealSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const [stage] = await db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(
      and(
        eq(pipelineStages.organizationId, context.organizationId),
        eq(pipelineStages.isLostStage, true),
        eq(pipelineStages.isActive, true),
      ),
    )
    .limit(1);
  if (!stage)
    return failureFrom(ActionErrorCode.INVALID_INPUT, "No active lost stage is configured.");
  const [reason] = await db
    .select({ id: lostReasons.id })
    .from(lostReasons)
    .where(
      and(
        eq(lostReasons.id, parsed.data.lostReasonId),
        eq(lostReasons.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  if (!reason) return notFoundFailure("Lost reason");
  // The reason is written in the same transaction as the move, or onto the
  // approval request when the move needs a manager.
  return applyStageChange(
    context,
    {
      dealId: parsed.data.dealId,
      stageId: stage.id,
      note: parsed.data.notes || "Opportunity marked lost",
    },
    {
      allowTerminalOutcome: true,
      lost: { reasonId: parsed.data.lostReasonId, notes: parsed.data.notes },
      afterMove: async (tx) => {
        await tx
          .update(deals)
          .set({
            lostReasonId: parsed.data.lostReasonId,
            lostNotes: parsed.data.notes,
            updatedBy: context.userId,
            updatedAt: new Date(),
          })
          .where(
            and(eq(deals.id, parsed.data.dealId), eq(deals.organizationId, context.organizationId)),
          );
      },
    },
  );
}

async function decideRequest(
  context: Awaited<ReturnType<typeof requirePermission>>,
  requestId: string,
  status: "rejected" | "cancelled",
  note: string,
): Promise<{ dealId: string } | ActionErrorResult> {
  const [request] = await db
    .select()
    .from(dealStageChangeRequests)
    .where(
      and(
        eq(dealStageChangeRequests.id, requestId),
        eq(dealStageChangeRequests.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  if (!request) return notFoundFailure("Approval request");
  if (request.status !== "pending")
    return failure(conflict("That request has already been decided."));
  if (!(await canAccessResource(context, { type: "deal", id: request.dealId })))
    return notFoundFailure("Opportunity");
  const decided = await db.transaction(async (tx) => {
    const rows = await tx
      .update(dealStageChangeRequests)
      .set({
        status,
        decidedBy: context.userId,
        decidedAt: new Date(),
        reason: note || request.reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dealStageChangeRequests.id, requestId),
          eq(dealStageChangeRequests.status, "pending"),
        ),
      )
      .returning({ id: dealStageChangeRequests.id });
    if (!rows.length) return false;
    await tx.insert(auditLogs).values({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: status === "rejected" ? "reject" : "update",
      entityType: "deal_stage_change_request",
      entityId: requestId,
      oldValues: { status: "pending" },
      newValues: {
        status,
        dealId: request.dealId,
        toStageId: request.toStageId,
        note: note || null,
      },
    });
    return true;
  });
  if (!decided) return failure(conflict("This request was already decided."));
  revalidatePath("/dashboard");
  revalidatePath(`/deals/${request.dealId}`);
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/approvals");
  return { dealId: request.dealId };
}
