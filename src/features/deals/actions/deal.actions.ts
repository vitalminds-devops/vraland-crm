"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dealFirstMonthPaid, dealReservationPaid } from "@/features/billing/lib/deal-payment";
import {
  inventoryStatusForDeal,
  isFullyPaid,
  readDealPayments,
} from "@/features/billing/lib/billing-inventory";
import {
  activities,
  auditLogs,
  contacts,
  dealAgents,
  dealCommissions,
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
import { dealTitleFor } from "../lib/deal-label";
import { recordDealCommissions } from "../lib/record-commissions";
import { enrollByTrigger } from "@/features/marketing/lib/auto-enroll";
import { missingOpportunityDetails } from "../lib/opportunity-requirements";
import { InventoryUnavailable, syncDealInventory } from "../lib/deal-inventory";
import {
  canMoveStage,
  closeDateFor,
  dealStatusForStage,
  canStartDealInStage,
  checkStageTransition,
  requiresApprovalForMove,
  requiresReason,
  resolveMoveRole,
  transitionMessage,
} from "../lib/stage-transitions";
import {
  contactDealSchema,
  lostDealSchema,
  stageApprovalSchema,
  stageChangeSchema,
  type ContactDealInput,
} from "../schemas/deal.schema";
import { logError } from "@/lib/logger";
import { manilaToday } from "@/lib/utils/manila-time";
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
const money = (value: number | null) => (value === null ? null : String(value));

export async function createDealForContact(
  contactId: string,
  primaryAgentUserId: string | null,
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
  if (opened) return saveDealForContact(contactId, primaryAgentUserId, input);
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
  if (primaryAgentUserId) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, primaryAgentUserId),
          eligibleAgent(context.organizationId),
          scopedAgentCondition(context),
        ),
      )
      .limit(1);
    if (!row) return failure(outOfScope("The selected agent is unavailable."));
  }
  try {
    const id = await db.transaction(async (tx) => {
      await lockActiveAssignees(tx, context.organizationId, [
        primaryAgentUserId,
        contact.brokerUserId,
      ]);
      const [row] = await tx
        .insert(deals)
        .values({
          organizationId: context.organizationId,
          dealCode: `DEAL-${randomUUID().toUpperCase()}`,
          title,
          dealType: v.dealType,
          stageId: v.stageId,
          developmentId,
          primaryAgentUserId,
          brokerUserId: contact.brokerUserId,
          amount: money(v.amount),
          expectedCommission: money(v.expectedCommission),
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
      if (primaryAgentUserId)
        await tx
          .insert(dealAgents)
          .values({
            dealId: row.id,
            userId: primaryAgentUserId,
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
    return databaseFailure("The opportunity could not be created because of a database error.");
  }
}

export async function saveDealForContact(
  contactId: string,
  primaryAgentUserId: string | null,
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
  if (!existing) return createDealForContact(contactId, primaryAgentUserId, input);

  await requirePermission("deals.update");
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
        })
        .from(deals)
        .where(and(eq(deals.id, existing.id), eq(deals.organizationId, context.organizationId)))
        .limit(1)
        .for("update");
      if (!before) throw new Error("Opportunity not found");
      // A won sale's amount and commission were settled when it was won; the contact form can't change them.
      const won = before.status === "won";
      const amount = won ? before.amount : money(v.amount);
      const expectedCommission = won ? before.expectedCommission : money(v.expectedCommission);
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
    return databaseFailure("The opportunity could not be updated because of a database error.");
  }
  if (existing.stageId !== v.stageId) {
    const moved = await changeDealStage({
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

/** Drizzle transaction handle, matching the other deal helpers. */
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type StageChangeContext = Awaited<ReturnType<typeof requirePermission>>;

/** Thrown inside a transaction to roll it back when another manager decided first. */
class RequestAlreadyDecided extends Error {
  constructor() {
    super("This request was already decided.");
  }
}

export async function changeDealStage(
  input: unknown,
  options: { allowTerminalOutcome?: boolean } = {},
): Promise<DealActionResult> {
  const context = await requirePermission("deals.change_stage");
  return applyStageChange(context, input, options);
}

async function applyStageChange(
  context: StageChangeContext,
  input: unknown,
  options: {
    allowTerminalOutcome?: boolean;
    /** Writes to append inside the same transaction, once the move has applied. */
    afterMove?: (tx: DbTransaction) => Promise<void>;
    /** Saved on the approval request so an approved "mark lost" keeps its reason. */
    lost?: { reasonId: string; notes: string };
  } = {},
): Promise<DealActionResult> {
  const parsed = stageChangeSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const { dealId, stageId, note, expectedUpdatedAt } = parsed.data;
  if (!(await canAccessResource(context, { type: "deal", id: dealId })))
    return notFoundFailure("Opportunity");
  const canApprove = context.permissions.has("deals.approve_stage_change");
  const canMoveBack = context.permissions.has("deals.move_back");
  const role = resolveMoveRole(context.roles);

  try {
    const outcome = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          stageId: deals.stageId,
          title: deals.title,
          status: deals.status,
          actualCloseDate: deals.actualCloseDate,
          updatedAt: deals.updatedAt,
          amount: deals.amount,
          propertyId: deals.propertyId,
          unitId: deals.unitId,
          unitIds: deals.unitIds,
          parkingSlotIds: deals.parkingSlotIds,
          primaryAgentUserId: deals.primaryAgentUserId,
          brokerUserId: deals.brokerUserId,
          reservationPaid: dealReservationPaid,
          firstMonthPaid: dealFirstMonthPaid,
        })
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.organizationId, context.organizationId)))
        .limit(1)
        // Lock the row so two simultaneous moves run one after the other.
        .for("update");
      if (!before) return { kind: "missing" as const };
      if (expectedUpdatedAt && before.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime())
        return {
          kind: "invalid" as const,
          message:
            "This opportunity changed while the selection was being saved. Refresh the pipeline and try again.",
        };
      const stageRows = await tx
        .select()
        .from(pipelineStages)
        .where(
          and(
            eq(pipelineStages.organizationId, context.organizationId),
            eq(pipelineStages.isActive, true),
          ),
        )
        .orderBy(asc(pipelineStages.position));
      const stage = stageRows.find((row) => row.id === stageId);
      const current = stageRows.find((row) => row.id === before.stageId);
      if (!stage || !current) return { kind: "missing" as const };
      const fromStage = {
        position: current.position,
        isWonStage: current.isWonStage,
        isLostStage: current.isLostStage,
        isCancelledStage: current.isCancelledStage,
        slug: current.slug,
      };
      const toStage = {
        position: stage.position,
        isWonStage: stage.isWonStage,
        isLostStage: stage.isLostStage,
        isCancelledStage: stage.isCancelledStage,
        slug: stage.slug,
      };

      const transition = checkStageTransition(fromStage, toStage, {
        allowTerminalOutcome: options.allowTerminalOutcome,
      });
      if (!transition.allowed) {
        if (transition.reason === "same-stage") {
          // Already there (moved directly meanwhile): approving must still close the request.
          await options.afterMove?.(tx);
          return { kind: "noop" as const };
        }
        return {
          kind: "invalid" as const,
          message: transitionMessage(transition.reason),
        };
      }

      const moveCheck = canMoveStage({
        userId: context.userId,
        role,
        deal: {
          primaryAgentUserId: before.primaryAgentUserId,
          brokerUserId: before.brokerUserId,
        },
        fromStage,
        toStage,
        reason: note,
        canMoveBack,
        payments: {
          reservationPaid: before.reservationPaid,
          firstMonthPaid: before.firstMonthPaid,
        },
      });
      if (!moveCheck.allowed) return { kind: "invalid" as const, message: moveCheck.message };
      if ((fromStage.slug === "leads" || fromStage.isLostStage) && toStage.slug === "opportunity") {
        const missing = await missingOpportunityDetails(tx, dealId);
        if (missing) return { kind: "invalid" as const, message: missing };
      }
      // shortcut: no refund record, so a sold deal stays sold; add refunds before allowing this.
      if (
        (toStage.isLostStage || toStage.isCancelledStage) &&
        isFullyPaid(await readDealPayments(tx, dealId))
      )
        return {
          kind: "invalid" as const,
          message:
            "This opportunity is fully paid. To close it, move it back to Opportunity, remove its payments in Billing, then close it.",
        };

      if (
        requiresReason({
          from: fromStage,
          to: toStage,
          canApprove,
        }) &&
        !note.trim()
      )
        return {
          kind: "invalid" as const,
          message:
            transition.direction === "backward"
              ? "Moving an opportunity back a stage requires a reason."
              : "This move requires a reason.",
        };

      const enteredGatedStage =
        current.requiresApproval ||
        (toStage.isLostStage && !canApprove && !stage.requiresApproval
          ? await dealHasGatedHistory(tx, dealId)
          : false);

      if (
        requiresApprovalForMove({
          toRequiresApproval: stage.requiresApproval,
          isLostStage: toStage.isLostStage,
          enteredGatedStage,
          canApprove,
        })
      ) {
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
        if (pending)
          return {
            kind: "invalid" as const,
            message: `${before.title} already has a stage change awaiting approval.`,
          };
        await tx.insert(dealStageChangeRequests).values({
          organizationId: context.organizationId,
          dealId,
          fromStageId: before.stageId,
          toStageId: stageId,
          requestedBy: context.userId,
          status: "pending",
          reason: note.trim() || null,
          lostReasonId: options.lost?.reasonId ?? null,
          lostNotes: options.lost?.notes || null,
        });
        await tx.insert(activities).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          activityType: "deal.stage_change_requested",
          summary: `${before.title} was sent to ${stage.name} for manager approval.`,
          dealId,
          metadata: {
            fromStageId: before.stageId,
            toStageId: stageId,
            requiresApproval: true,
          },
        });
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "create",
          entityType: "deal_stage_change_request",
          entityId: dealId,
          newValues: {
            dealId,
            fromStageId: before.stageId,
            toStageId: stageId,
            status: "pending",
          },
        });
        return {
          kind: "pending" as const,
          stageName: stage.name,
          title: before.title,
        };
      }

      const status = dealStatusForStage(stage);
      const actualCloseDate = closeDateFor(status, before, manilaToday());
      const inventoryProperties = await syncDealInventory(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        dealId,
        buildingId: before.propertyId,
        unitIds: before.unitIds.length ? before.unitIds : before.unitId ? [before.unitId] : [],
        parkingSlotIds: before.parkingSlotIds,
        status: inventoryStatusForDeal(stage, await readDealPayments(tx, dealId)),
      });
      await tx
        .update(deals)
        .set({
          stageId,
          status,
          probability: stage.defaultProbability,
          actualCloseDate,
          cancellationReason: stage.isCancelledStage ? note || null : null,
          updatedBy: context.userId,
          updatedAt: new Date(),
        })
        .where(eq(deals.id, dealId));
      await tx.insert(dealStageHistory).values({
        dealId,
        fromStageId: before.stageId,
        toStageId: stageId,
        changedBy: context.userId,
        note: note || `Moved to ${stage.name}`,
      });
      await enrollByTrigger(tx, {
        organizationId: context.organizationId,
        trigger: "deal_stage_changed",
        dealId,
      });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "deal.stage_changed",
        summary: `${before.title} moved to ${stage.name}.`,
        dealId,
        metadata: { fromStageId: before.stageId, toStageId: stageId },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "deal",
        entityId: dealId,
        oldValues: { stageId: before.stageId, status: before.status },
        newValues: { stageId, status },
      });
      const leftOutcome =
        (before.status === "won" || before.status === "cancelled" || before.status === "lost") &&
        status !== before.status;
      if (leftOutcome) {
        const outcomeChanged = status === "lost" || status === "cancelled";
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: outcomeChanged ? "outcome_changed" : "reopen",
          entityType: "deal",
          entityId: dealId,
          oldValues: {
            stageId: before.stageId,
            stageName: current.name,
            status: before.status,
          },
          newValues: {
            stageId,
            stageName: stage.name,
            status,
            note: note.trim() || null,
          },
        });
      }
      if (status === "won" && before.status !== "won")
        await recordDealCommissions(tx, {
          organizationId: context.organizationId,
          dealId,
          amount: before.amount,
          sellerUserId: before.primaryAgentUserId,
          brokerUserId: before.brokerUserId,
        });
      else if (before.status === "won" && status !== "won")
        await tx.delete(dealCommissions).where(eq(dealCommissions.dealId, dealId));
      await options.afterMove?.(tx);
      // A request left open by this move is out of date; close it so the card stops showing it.
      await tx
        .update(dealStageChangeRequests)
        .set({
          status: "cancelled",
          decidedBy: context.userId,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(dealStageChangeRequests.dealId, dealId),
            eq(dealStageChangeRequests.status, "pending"),
          ),
        );
      return { kind: "moved" as const, inventoryProperties };
    });

    if (outcome.kind === "missing") return notFoundFailure("Opportunity");
    if (outcome.kind === "invalid")
      return failureFrom(ActionErrorCode.INVALID_INPUT, outcome.message);
    if (outcome.kind === "noop") return success({ id: dealId });
    if (outcome.kind === "pending") {
      revalidatePath("/pipeline");
      revalidatePath("/pipeline/list");
      revalidatePath(`/deals/${dealId}`);
      revalidatePath("/pipeline/approvals");
      revalidatePath("/dashboard");
      return success({
        id: dealId,
        approvalRequested: true,
        message: `${outcome.title} was sent to ${outcome.stageName} for manager approval.`,
      });
    }
    revalidatePath("/pipeline");
    revalidatePath("/pipeline/list");
    revalidatePath("/pipeline/lost");
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/dashboard");
    revalidatePath("/contacts");
    revalidatePath("/properties");
    revalidatePath("/developments", "layout");
    revalidatePath("/billing");
    for (const propertyId of outcome.inventoryProperties) {
      revalidatePath(`/properties/${propertyId}`);
      revalidatePath(`/properties/${propertyId}/units`);
      revalidatePath(`/properties/${propertyId}/access`);
    }
    return success({ id: dealId });
  } catch (error) {
    if (error instanceof InventoryUnavailable) return failure(conflict(error.message));
    if (error instanceof RequestAlreadyDecided) return failure(conflict(error.message));
    logError("Stage change failed", error, { operation: "deal_stage_change" });
    return databaseFailure("The stage could not be changed.");
  }
}

async function dealHasGatedHistory(tx: DbTransaction, dealId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: dealStageHistory.id })
    .from(dealStageHistory)
    .innerJoin(pipelineStages, eq(pipelineStages.id, dealStageHistory.toStageId))
    .where(and(eq(dealStageHistory.dealId, dealId), eq(pipelineStages.requiresApproval, true)))
    .limit(1);
  return Boolean(row);
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
    return notFoundFailure("Deal");
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
