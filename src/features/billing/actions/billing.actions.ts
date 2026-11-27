"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  auditLogs,
  billItems,
  bills,
  dealStageChangeRequests,
  deals,
  documents,
  payments,
  pipelineStages,
} from "@/db/schema";
import { documentFileError, requirementFileTypes } from "@/lib/storage/document-validation";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { conflict, permissionDenied } from "@/lib/errors";
import { InventoryUnavailable } from "@/features/deals/lib/deal-inventory";
import { missingPaymentOf } from "@/features/deals/lib/stage-transitions";
import {
  inventoryHeldElsewhere,
  lockDealForInventory,
  syncBillingInventory,
} from "../lib/billing-inventory";
import {
  billPaid,
  billTotal,
  dealFirstMonthPaid,
  dealMonthlyAmortization,
  dealReservationFee,
  dealReservationPaid,
  dealReservationReceived,
} from "../lib/deal-payment";
import { stagesAfterPayment } from "../lib/payment-stage";
import { applyStageChange } from "@/features/deals/lib/apply-stage-change";
import { logError } from "@/lib/logger";
import { canAccessResource, requireAuthorizationContext } from "@/lib/permissions/authorization";
import { canManageBilling, type AuthorizationContext } from "@/lib/permissions/policy";
import {
  databaseFailure,
  failure,
  notFoundFailure,
  success,
  validationFailure,
  validationFailureFromZod,
  type ActionResult,
} from "@/lib/types/action-result";
import { billSchema, paymentSchema, removePaymentSchema } from "../schemas/billing.schema";

const money = (value: number) => value.toFixed(2);

/** Thrown to roll back a void that would leave the deal past a payment gate it no longer meets. */
class StageNeedsPayment extends Error {}

async function requireBillingManager() {
  const context = await requireAuthorizationContext();
  return canManageBilling(context) ? context : null;
}

function refresh(dealId: string, propertyIds: string[]) {
  revalidatePath("/billing");
  revalidatePath(`/billing/${dealId}`);
  revalidatePath("/payments");
  revalidatePath("/pipeline");
  revalidatePath("/properties");
  revalidatePath("/developments", "layout");
  for (const id of propertyIds) {
    revalidatePath(`/properties/${id}`);
    revalidatePath(`/properties/${id}/units`);
    revalidatePath(`/properties/${id}/access`);
  }
}

const notManager = () => failure(permissionDenied("You don't have permission to manage billing."));

const LEAD_NOT_BILLABLE = "Move this lead to Opportunity before billing it.";

/** Billing reaches only the opportunities in the user's data access. */
const dealInScope = (context: AuthorizationContext, dealId: string) =>
  canAccessResource(context, { type: "deal", id: dealId });

/** Creates the opportunity's bill, or updates it; the broker billed is the opportunity's broker. */
export async function saveBill(input: unknown): Promise<ActionResult<{ id: string }>> {
  const context = await requireBillingManager();
  if (!context) return notManager();
  const parsed = billSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const value = parsed.data;
  const unitPrice = value.items.reduce((sum, item) => sum + item.unitPrice, 0);
  const miscellaneousFee = value.items.reduce((sum, item) => sum + item.miscellaneousFee, 0);
  const unitLabel = value.items
    .map((item) => item.unitLabel)
    .join(" + ")
    .slice(0, 220);

  try {
    if (!(await dealInScope(context, value.dealId))) return notFoundFailure("Opportunity");
    const outcome = await db.transaction(async (tx) => {
      const deal = await lockDealForInventory(tx, context.organizationId, value.dealId);
      if (!deal) return { kind: "missing" as const };
      if (deal.slug === "leads") return { kind: "lead" as const };
      const held = await inventoryHeldElsewhere(tx, deal);
      if (held) return { kind: "held" as const, message: held };

      const [existing] = await tx
        .select({
          id: bills.id,
          unitLabel: bills.unitLabel,
          unitPrice: bills.unitPrice,
          miscellaneousFee: bills.miscellaneousFee,
          reservationDiscount: bills.reservationDiscount,
        })
        .from(bills)
        .where(eq(bills.dealId, value.dealId))
        .for("update");
      const reservationDiscount =
        value.reservationDiscount ?? Number(existing?.reservationDiscount ?? 0);
      if (reservationDiscount > unitPrice) return { kind: "discount-too-large" as const };
      const total = unitPrice - reservationDiscount + miscellaneousFee;
      // A ₱0 bill would read as paid in full and open the stage gates with nothing paid.
      if (total <= 0) return { kind: "zero-total" as const };
      // Commissions were split from the net price when the deal was won.
      if (
        deal.isWonStage &&
        existing &&
        Math.abs(
          unitPrice -
            reservationDiscount -
            (Number(existing.unitPrice) - Number(existing.reservationDiscount)),
        ) > 0.004
      )
        return { kind: "won-price" as const };
      if (existing) {
        const [{ paid }] = await tx
          .select({ paid: billPaid() })
          .from(bills)
          .where(eq(bills.id, existing.id));
        if (total < Number(paid)) return { kind: "below-paid" as const, paid: Number(paid) };
      }

      const fields = {
        brokerUserId: deal.brokerUserId,
        unitLabel,
        unitPrice: money(unitPrice),
        miscellaneousFee: money(miscellaneousFee),
        reservationDiscount: money(reservationDiscount),
        notes: value.notes,
        ...(value.applicantDetails === undefined
          ? {}
          : { applicantDetails: value.applicantDetails }),
        updatedBy: context.userId,
        updatedAt: new Date(),
      };
      const [saved] = existing
        ? await tx
            .update(bills)
            .set(fields)
            .where(eq(bills.id, existing.id))
            .returning({ id: bills.id })
        : await tx
            .insert(bills)
            .values({
              ...fields,
              organizationId: context.organizationId,
              dealId: value.dealId,
              createdBy: context.userId,
            })
            .returning({ id: bills.id });
      await tx.delete(billItems).where(eq(billItems.billId, saved.id));
      // A line keeps its unit or slot only when it is still this opportunity's.
      const dealUnits = new Set([deal.unitId, ...(deal.unitIds ?? [])]);
      const dealSlots = new Set(deal.parkingSlotIds ?? []);
      await tx.insert(billItems).values(
        value.items.map((item, position) => ({
          billId: saved.id,
          position,
          unitId: item.unitId && dealUnits.has(item.unitId) ? item.unitId : null,
          parkingSlotId:
            item.parkingSlotId && dealSlots.has(item.parkingSlotId) ? item.parkingSlotId : null,
          unitLabel: item.unitLabel,
          unitPrice: money(item.unitPrice),
          miscellaneousFee: money(item.miscellaneousFee),
        })),
      );

      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: existing ? "update" : "create",
        entityType: "bill",
        entityId: saved.id,
        oldValues: existing ?? null,
        newValues: {
          dealId: value.dealId,
          brokerUserId: deal.brokerUserId,
          items: value.items,
          unitPrice: fields.unitPrice,
          miscellaneousFee: fields.miscellaneousFee,
          reservationDiscount: fields.reservationDiscount,
          total: money(total),
          applicantDetailsUpdated: value.applicantDetails !== undefined,
        },
      });
      const propertyIds = await syncBillingInventory(tx, context, deal);
      return { kind: "saved" as const, id: saved.id, propertyIds };
    });

    if (outcome.kind === "missing") return notFoundFailure("Opportunity");
    if (outcome.kind === "lead") return validationFailure(LEAD_NOT_BILLABLE);
    if (outcome.kind === "held") return validationFailure(outcome.message);
    if (outcome.kind === "discount-too-large")
      return validationFailure("The reservation discount cannot exceed the selling price.");
    if (outcome.kind === "zero-total")
      return validationFailure("The bill total must be more than ₱0.");
    if (outcome.kind === "won-price")
      return validationFailure(
        "This opportunity is won and its commissions are set. Reopen it to change the price.",
      );
    if (outcome.kind === "below-paid")
      return validationFailure(
        `The total cannot be less than the ₱${outcome.paid.toLocaleString("en-PH")} already paid.`,
      );
    refresh(value.dealId, outcome.propertyIds);
    return success({ id: outcome.id });
  } catch (error) {
    if (error instanceof InventoryUnavailable) return failure(conflict(error.message));
    logError("Bill save failed", error, { operation: "billing_save_bill" });
    return databaseFailure("Couldn't save the bill.");
  }
}

export async function recordPayment(
  input: unknown,
  transactionSlip?: File,
): Promise<ActionResult<{ id: string; message: string }>> {
  const context = await requireBillingManager();
  if (!context) return notManager();
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const value = parsed.data;
  if (value.method === "online") {
    if (!(transactionSlip instanceof File))
      return validationFailure("Upload a transaction slip before recording the payment.");
    const error = await documentFileError(transactionSlip, requirementFileTypes);
    if (error) return validationFailure(error);
  } else if (transactionSlip !== undefined) {
    return validationFailure("Transaction slips are only accepted for Online payments.");
  }
  let storedKey: string | undefined;
  let savedPaymentId: string | undefined;

  try {
    const slipBody = transactionSlip ? Buffer.from(await transactionSlip.arrayBuffer()) : null;
    const outcome = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ dealId: bills.dealId })
        .from(bills)
        .where(and(eq(bills.id, value.billId), eq(bills.organizationId, context.organizationId)));
      if (!target || !(await dealInScope(context, target.dealId)))
        return { kind: "missing" as const };
      const deal = await lockDealForInventory(tx, context.organizationId, target.dealId);
      if (!deal) return { kind: "missing" as const };
      if (deal.isLostStage || deal.isCancelledStage) return { kind: "closed" as const };
      if (deal.slug === "leads") return { kind: "lead" as const };
      const held = await inventoryHeldElsewhere(tx, deal);
      if (held) return { kind: "held" as const, message: held };
      // All billing changes lock deal, bill, then inventory in the same order as stage moves.
      const [bill] = await tx
        .select({
          id: bills.id,
          dealId: bills.dealId,
          total: billTotal,
        })
        .from(bills)
        .where(and(eq(bills.id, value.billId), eq(bills.organizationId, context.organizationId)))
        .for("update");
      if (!bill) return { kind: "missing" as const };
      const [{ paid, reservationFee, reservationPaid, monthlyAmount }] = await tx
        .select({
          paid: billPaid(),
          reservationFee: dealReservationFee,
          monthlyAmount: dealMonthlyAmortization,
          reservationPaid: billPaid("reservation"),
        })
        .from(bills)
        .innerJoin(deals, eq(deals.id, bills.dealId))
        .where(eq(bills.id, bill.id));
      const balance = Number(bill.total) - Number(paid);
      if (value.amount > balance + 0.004) return { kind: "over" as const, balance };
      if (value.classification === "full_payment" && value.amount < balance - 0.004)
        return { kind: "short" as const, balance };
      // A Reservation may go above the fee but must cover what is left of it (or the balance, if smaller).
      const reservationDue = Math.min(
        Number(reservationFee ?? 0) - Number(reservationPaid ?? 0),
        balance,
      );
      if (value.classification === "reservation" && value.amount < reservationDue - 0.004)
        return { kind: "reservation-short" as const, due: reservationDue };
      if (value.classification === "monthly") {
        // Monthly payments start only after the reservation fee (or any reservation, if none is set) is paid.
        if (reservationDue > 0.004 || !(Number(reservationPaid) > 0))
          return { kind: "reservation-unpaid" as const };
        const monthlyDue = Math.min(Number(monthlyAmount ?? 0), balance);
        if (value.amount < monthlyDue - 0.004)
          return { kind: "monthly-short" as const, due: monthlyDue };
      }

      let transactionSlipDocumentId: string | null = null;
      if (transactionSlip && slipBody) {
        transactionSlipDocumentId = randomUUID();
        storedKey = `${context.organizationId}/payments/${transactionSlipDocumentId}.${requirementFileTypes[transactionSlip.type]}`;
        await getDocumentStorage().put(storedKey, slipBody);
        await tx.insert(documents).values({
          id: transactionSlipDocumentId,
          organizationId: context.organizationId,
          dealId: bill.dealId,
          name: transactionSlip.name.slice(0, 220),
          documentType: "transaction_slip",
          category: "payment",
          isSensitive: true,
          status: "final",
          storageKey: storedKey,
          mimeType: transactionSlip.type,
          fileSizeBytes: transactionSlip.size,
          checksumSha256: createHash("sha256").update(slipBody).digest("hex"),
          createdBy: context.userId,
        });
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "create",
          entityType: "document",
          entityId: transactionSlipDocumentId,
          newValues: { documentType: "transaction_slip", billId: bill.id, dealId: bill.dealId },
        });
      }
      const [payment] = await tx
        .insert(payments)
        .values({
          organizationId: context.organizationId,
          billId: bill.id,
          amount: money(value.amount),
          paidOn: value.paidOn,
          method: value.method,
          classification: value.classification,
          referenceNo: value.referenceNo,
          transactionSlipDocumentId,
          notes: value.notes,
          recordedBy: context.userId,
        })
        .returning({ id: payments.id });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "payment",
        entityId: payment.id,
        newValues: {
          billId: bill.id,
          dealId: bill.dealId,
          amount: money(value.amount),
          paidOn: value.paidOn,
          method: value.method,
          classification: value.classification,
          referenceNo: value.referenceNo,
          transactionSlipDocumentId,
        },
      });
      const propertyIds = await syncBillingInventory(tx, context, deal);
      const stages = await tx
        .select({
          id: pipelineStages.id,
          name: pipelineStages.name,
          slug: pipelineStages.slug,
          isWonStage: pipelineStages.isWonStage,
        })
        .from(pipelineStages)
        .where(
          and(
            eq(pipelineStages.organizationId, context.organizationId),
            eq(pipelineStages.isActive, true),
          ),
        );
      return {
        kind: "saved" as const,
        id: payment.id,
        dealId: bill.dealId,
        propertyIds,
        nextStages: stagesAfterPayment(value.classification, deal.slug, stages),
      };
    });

    if (outcome.kind === "missing") return notFoundFailure("Bill");
    if (outcome.kind === "lead") return validationFailure(LEAD_NOT_BILLABLE);
    if (outcome.kind === "held") return validationFailure(outcome.message);
    if (outcome.kind === "closed")
      return validationFailure(
        "This opportunity is lost or cancelled. Reopen it to record a payment.",
      );
    if (outcome.kind === "short")
      return validationFailure(
        `A full payment must cover the whole ₱${outcome.balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })} balance. Use Monthly for part of it.`,
      );
    if (outcome.kind === "reservation-short")
      return validationFailure(
        `A reservation must be at least the ₱${outcome.due.toLocaleString("en-PH", { minimumFractionDigits: 2 })} reservation fee.`,
      );
    if (outcome.kind === "reservation-unpaid")
      return validationFailure("Pay the reservation fee before recording a monthly payment.");
    if (outcome.kind === "monthly-short")
      return validationFailure(
        `A monthly payment must be at least the ₱${outcome.due.toLocaleString("en-PH", { minimumFractionDigits: 2 })} monthly amortization.`,
      );
    if (outcome.kind === "over")
      return validationFailure(
        outcome.balance <= 0
          ? "This bill is already fully paid."
          : `The payment is more than the ₱${outcome.balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })} balance.`,
      );
    savedPaymentId = outcome.id;
    refresh(outcome.dealId, outcome.propertyIds);
    // After the payment commits, so a refused move or one awaiting approval never loses the payment.
    // One stage at a time; stop at the first move that is refused or sent for approval.
    let movedTo = "";
    let stopped = "";
    if (context.permissions.has("deals.change_stage"))
      for (const stage of outcome.nextStages) {
        const moved = await applyStageChange(context, {
          dealId: outcome.dealId,
          stageId: stage.id,
        });
        if (!moved.success) {
          const missing = missingPaymentOf(moved.error.details);
          stopped =
            missing === "reservation"
              ? "Reservation fee not fully paid yet."
              : missing === "first-month"
                ? "Monthly amortization not fully paid yet."
                : `Not moved to ${stage.name}.`;
          break;
        }
        if (moved.data.approvalRequested) {
          stopped = `Sent to ${stage.name} for approval.`;
          break;
        }
        movedTo = `Moved to ${stage.name}.`;
      }
    const message = ["Payment recorded.", movedTo, stopped].filter(Boolean).join(" ");
    return success({ id: outcome.id, message });
  } catch (error) {
    if (storedKey && !savedPaymentId)
      await getDocumentStorage()
        .remove(storedKey)
        .catch(() => undefined);
    if (savedPaymentId) {
      logError("Payment saved but follow-up failed", error, {
        operation: "billing_record_payment",
        paymentId: savedPaymentId,
      });
      return success({
        id: savedPaymentId,
        message:
          "Payment recorded. Automatic updates couldn't finish; refresh the bill to check its status.",
      });
    }
    if (error instanceof InventoryUnavailable) return failure(conflict(error.message));
    logError("Payment record failed", error, {
      operation: "billing_record_payment",
    });
    return databaseFailure("Couldn't save the payment.");
  }
}

/** Voids a payment recorded by mistake; it stays in the audit log. */
export async function removePayment(input: unknown): Promise<ActionResult<{ id: string }>> {
  const context = await requireBillingManager();
  if (!context) return notManager();
  const parsed = removePaymentSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);

  try {
    const outcome = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ billId: payments.billId, dealId: bills.dealId })
        .from(payments)
        .innerJoin(bills, eq(payments.billId, bills.id))
        .where(
          and(
            eq(payments.id, parsed.data.id),
            eq(payments.organizationId, context.organizationId),
            isNull(payments.deletedAt),
          ),
        );
      if (!target || !(await dealInScope(context, target.dealId))) return null;
      const deal = await lockDealForInventory(tx, context.organizationId, target.dealId);
      if (!deal) return null;
      const [bill] = await tx
        .select({ id: bills.id })
        .from(bills)
        .where(and(eq(bills.id, target.billId), eq(bills.organizationId, context.organizationId)))
        .for("update");
      if (!bill) return null;
      // The stage the deal sits in was reached on its payments; voiding one it stands on would strand
      // it. Won stands on both gates, and a reserved or won deal always keeps some reservation money.
      const gates = deal.isWonStage
        ? [dealFirstMonthPaid, dealReservationPaid, dealReservationReceived]
        : deal.slug === "reservation"
          ? [dealReservationPaid, dealReservationReceived]
          : [];
      const gatesMet = async () =>
        Promise.all(
          gates.map(
            async (gate) =>
              (await tx.select({ met: gate }).from(deals).where(eq(deals.id, deal.id)))[0]?.met ===
              true,
          ),
        );
      const metBefore = await gatesMet();
      const [removed] = await tx
        .update(payments)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(payments.id, parsed.data.id),
            eq(payments.organizationId, context.organizationId),
            isNull(payments.deletedAt),
          ),
        )
        .returning({
          id: payments.id,
          billId: payments.billId,
          amount: payments.amount,
        });
      if (!removed) return null;
      // Only what this void breaks is refused: a gate already unmet (e.g. an older deal) never blocks.
      const metAfter = await gatesMet();
      if (metBefore.some((met, index) => met && !metAfter[index])) throw new StageNeedsPayment();
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "payment",
        entityId: removed.id,
        oldValues: { billId: removed.billId, amount: removed.amount },
      });
      // A move waiting for approval on the payment just removed can no longer go through.
      const met = async (gate: typeof dealFirstMonthPaid) =>
        (await tx.select({ met: gate }).from(deals).where(eq(deals.id, deal.id)))[0]?.met === true;
      const waiting = await tx
        .select({
          id: dealStageChangeRequests.id,
          toWon: pipelineStages.isWonStage,
          toSlug: pipelineStages.slug,
        })
        .from(dealStageChangeRequests)
        .innerJoin(pipelineStages, eq(pipelineStages.id, dealStageChangeRequests.toStageId))
        .where(
          and(
            eq(dealStageChangeRequests.dealId, deal.id),
            eq(dealStageChangeRequests.status, "pending"),
          ),
        );
      const stale: string[] = [];
      for (const request of waiting)
        if (
          (request.toWon && !(await met(dealFirstMonthPaid))) ||
          (request.toSlug === "reservation" && !(await met(dealReservationPaid)))
        )
          stale.push(request.id);
      if (stale.length)
        await tx
          .update(dealStageChangeRequests)
          .set({
            status: "cancelled",
            decidedBy: context.userId,
            decidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(inArray(dealStageChangeRequests.id, stale));
      const propertyIds = await syncBillingInventory(tx, context, deal);
      return { id: removed.id, dealId: deal.id, propertyIds };
    });
    if (!outcome) return notFoundFailure("Payment");
    refresh(outcome.dealId, outcome.propertyIds);
    return success({ id: outcome.id });
  } catch (error) {
    if (error instanceof InventoryUnavailable) return failure(conflict(error.message));
    if (error instanceof StageNeedsPayment)
      return failure(
        conflict("The opportunity's stage depends on this payment. Move it back a stage first."),
      );
    logError("Payment removal failed", error, {
      operation: "billing_remove_payment",
    });
    return databaseFailure("Couldn't remove the payment.");
  }
}
