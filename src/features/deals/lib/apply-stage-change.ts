import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dealFirstMonthPaid, dealReservationPaid } from "@/features/billing/lib/deal-payment";
import {
  inventoryStatusForDeal,
  readReservationReceived,
  isFullyPaid,
  readDealPayments,
} from "@/features/billing/lib/billing-inventory";
import {
  activities,
  auditLogs,
  dealCommissions,
  deals,
  dealStageChangeRequests,
  dealStageHistory,
  pipelineStages,
  units,
} from "@/db/schema";
import { canAccessResource } from "@/lib/permissions/authorization";
import { canManageBilling, type AuthorizationContext } from "@/lib/permissions/policy";
import { recordDealCommissions } from "./record-commissions";
import { enrollByTrigger } from "@/features/marketing/lib/auto-enroll";
import { missingOpportunityDetails } from "./opportunity-requirements";
import {
  heldElsewhere,
  heldElsewhereMessage,
  InventoryUnavailable,
  syncDealInventory,
} from "./deal-inventory";
import {
  canMoveStage,
  missingPaymentMessage,
  closeDateFor,
  dealStatusForStage,
  checkStageTransition,
  requiresApprovalForMove,
  requiresReason,
  resolveMoveRole,
  transitionMessage,
} from "./stage-transitions";
import { stageChangeSchema } from "../schemas/deal.schema";
import { logError } from "@/lib/logger";
import { manilaToday } from "@/lib/utils/manila-time";
import {
  databaseFailure,
  failure,
  failureFrom,
  notFoundFailure,
  success,
  validationFailureFromZod,
  type ActionResult,
} from "@/lib/types/action-result";
import { ActionErrorCode, conflict } from "@/lib/errors";

type DealActionResult = ActionResult<{ id: string; approvalRequested?: true; message?: string }>;

/** Drizzle transaction handle, matching the other deal helpers. */
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Thrown inside a transaction to roll it back when another manager decided first. */
export class RequestAlreadyDecided extends Error {
  constructor() {
    super("This request was already decided.");
  }
}

/**
 * Moves an opportunity to a stage, or sends the move for approval. The caller has already checked
 * the permission (`deals.change_stage`, or `deals.approve_stage_change` when approving).
 */
export async function applyStageChange(
  context: AuthorizationContext,
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
  const role = resolveMoveRole(context);

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
      if (!moveCheck.allowed)
        return {
          kind: "invalid" as const,
          message: moveCheck.payment
            ? missingPaymentMessage(moveCheck.payment, canManageBilling(context))
            : moveCheck.message,
          payment: moveCheck.payment,
        };
      if ((fromStage.slug === "leads" || fromStage.isLostStage) && toStage.slug === "opportunity") {
        const missing = await missingOpportunityDetails(tx, dealId);
        // Lost while still a lead, it never had its Opportunity details: go through Leads.
        if (missing)
          return {
            kind: "invalid" as const,
            message: fromStage.isLostStage
              ? "This was lost while still a lead. Reopen it to Leads, then use Move to Opportunity."
              : missing,
          };
        // Units and parking stay open to others until Reservation, but one another opportunity
        // has reserved since (say, while this move waited for approval) can't be this one's too.
        const taken = await heldElsewhere(tx, {
          id: dealId,
          unitIds: before.unitIds,
          parkingSlotIds: before.parkingSlotIds,
        });
        if (taken.length)
          return {
            kind: "invalid" as const,
            message: `${heldElsewhereMessage(taken)} ${
              fromStage.isLostStage
                ? "Reopen it to Leads and pick again."
                : "Pick again with Move to Opportunity."
            }`,
          };
      }
      // Back in Leads an opportunity lets go of its units, so it can't while money is recorded on
      // them: the units would stay held by an opportunity that no longer lists them.
      if (
        toStage.slug === "leads" &&
        fromStage.slug !== "leads" &&
        (await readDealPayments(tx, dealId)).paid > 0
      )
        return {
          kind: "invalid" as const,
          message:
            "This opportunity has payments. Remove its payments in Billing before moving it back to Leads.",
        };
      // shortcut: no refund record. Closing would put paid-for units back on sale while the money
      // is still recorded, so any payment has to be removed first; add refunds before allowing this.
      if (toStage.isLostStage || toStage.isCancelledStage) {
        const payments = await readDealPayments(tx, dealId);
        if (payments.paid > 0)
          return {
            kind: "invalid" as const,
            message: isFullyPaid(payments)
              ? "This opportunity is fully paid. To close it, move it back to Opportunity, remove its payments in Billing, then close it."
              : "This opportunity has payments. Remove its payments in Billing before closing it.",
          };
      }

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
      // Back in Leads the units and parking go back on sale, so the opportunity lets go of them and
      // of the fees quoted for them; Move to Opportunity then starts from a clean pick.
      const heldUnitIds = before.unitIds;
      const releasing =
        stage.slug === "leads" && (heldUnitIds.length > 0 || before.parkingSlotIds.length > 0);
      const inventoryProperties = await syncDealInventory(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        dealId,
        buildingId: before.propertyId,
        unitIds: before.unitIds,
        parkingSlotIds: before.parkingSlotIds,
        status: inventoryStatusForDeal(
          stage,
          await readDealPayments(tx, dealId),
          await readReservationReceived(tx, dealId),
        ),
      });
      await tx
        .update(deals)
        .set({
          stageId,
          status,
          probability: stage.defaultProbability,
          actualCloseDate,
          cancellationReason: stage.isCancelledStage ? note || null : null,
          // Reopened, it is no longer lost: its old loss reason would only mislead.
          ...(status !== "lost" && { lostReasonId: null, lostNotes: null }),
          ...(releasing && {
            unitIds: [],
            parkingSlots: 0,
            parkingSlotIds: [],
            parkingAmount: null,
            // The old price would keep showing on the lead's card and in pipeline totals.
            amount: null,
            reservationFee: null,
            parkingReservationFee: null,
            monthlyAmortization: null,
          }),
          updatedBy: context.userId,
          updatedAt: new Date(),
        })
        .where(eq(deals.id, dealId));
      if (releasing) {
        const released = heldUnitIds.length
          ? await tx.select({ code: units.code }).from(units).where(inArray(units.id, heldUnitIds))
          : [];
        const names = [
          ...released.map((unit) => `Unit ${unit.code}`),
          ...(before.parkingSlotIds.length
            ? [
                `${before.parkingSlotIds.length} parking ${
                  before.parkingSlotIds.length === 1 ? "slot" : "slots"
                }`,
              ]
            : []),
        ];
        await tx.insert(activities).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          activityType: "deal.units_released",
          summary: `${before.title} let go of ${names.join(", ")} on moving back to Leads.`,
          dealId,
          metadata: { unitIds: heldUnitIds, parkingSlotIds: before.parkingSlotIds },
        });
      }
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
      // The commission is set by the first win and kept through a reopen, so a price changed in
      // Billing meanwhile never changes it; only a deal that ends lost or cancelled drops it.
      if (status === "won" && before.status !== "won") {
        const [earned] = await tx
          .select({ total: sql<string | null>`sum(${dealCommissions.amount})` })
          .from(dealCommissions)
          .where(eq(dealCommissions.dealId, dealId));
        if (earned?.total === null || earned?.total === undefined)
          await recordDealCommissions(tx, {
            organizationId: context.organizationId,
            dealId,
            amount: before.amount,
            sellerUserId: before.primaryAgentUserId,
            brokerUserId: before.brokerUserId,
          });
        else
          await tx
            .update(deals)
            .set({ expectedCommission: earned.total })
            .where(eq(deals.id, dealId));
      } else if (status === "lost" || status === "cancelled")
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
      return failureFrom(
        ActionErrorCode.INVALID_INPUT,
        outcome.message,
        // Callers such as Billing read which payment is missing from here, not from the text.
        "payment" in outcome && outcome.payment ? { payment: outcome.payment } : undefined,
      );
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
    return databaseFailure("Couldn't change the stage.");
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
