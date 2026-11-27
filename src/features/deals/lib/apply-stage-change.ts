import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dealFirstMonthPaid, dealReservationPaid } from "@/features/billing/lib/deal-payment";
import {
  inventoryStatusForDeal,
  readReservationReceived,
  readDealPayments,
} from "@/features/billing/lib/billing-inventory";
import { activities, auditLogs, deals, dealStageHistory, pipelineStages } from "@/db/schema";
import { canAccessResource } from "@/lib/permissions/authorization";
import { canManageBilling, type AuthorizationContext } from "@/lib/permissions/policy";
import { enrollByTrigger } from "@/features/marketing/lib/auto-enroll";
import { InventoryUnavailable, syncDealInventory } from "./deal-inventory";
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
import { inventoryOrPaymentRefusal } from "./stage-guards";
import { dealHasGatedHistory, requestStageApproval } from "./stage-approval";
import {
  cancelOpenRequests,
  recordOutcomeChange,
  recordUnitsReleased,
  settleCommissions,
} from "./stage-effects";
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
          agentUserId: deals.agentUserId,
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
          agentUserId: before.agentUserId,
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
      const refusal = await inventoryOrPaymentRefusal(
        tx,
        { id: dealId, unitIds: before.unitIds, parkingSlotIds: before.parkingSlotIds },
        fromStage,
        toStage,
      );
      if (refusal) return { kind: "invalid" as const, message: refusal };

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
        const refused = await requestStageApproval(tx, context, {
          dealId,
          title: before.title,
          fromStageId: before.stageId,
          toStageId: stageId,
          toStageName: stage.name,
          note,
          lost: options.lost,
        });
        if (refused) return { kind: "invalid" as const, message: refused };
        return { kind: "pending" as const, stageName: stage.name, title: before.title };
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
        propertyId: before.propertyId,
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
            parkingSlotCount: 0,
            parkingSlotIds: [],
            parkingAmount: null,
            // The old price would keep showing on the lead's card and in pipeline totals.
            amount: null,
            reservationFee: null,
            parkingReservationFee: null,
            monthlyAmortization: null,
            parkingMonthlyAmortization: null,
          }),
          updatedBy: context.userId,
          updatedAt: new Date(),
        })
        .where(eq(deals.id, dealId));
      if (releasing)
        await recordUnitsReleased(tx, context, {
          id: dealId,
          title: before.title,
          unitIds: heldUnitIds,
          parkingSlotIds: before.parkingSlotIds,
        });
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
      await recordOutcomeChange(tx, context, {
        dealId,
        note,
        from: { stageId: before.stageId, stageName: current.name, status: before.status },
        to: { stageId, stageName: stage.name, status },
      });
      await settleCommissions(
        tx,
        context.organizationId,
        { id: dealId, ...before },
        before.status,
        status,
      );
      await options.afterMove?.(tx);
      await cancelOpenRequests(tx, context.userId, dealId);
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
