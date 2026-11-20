"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  auditLogs,
  billItems,
  bills,
  deals,
  documents,
  payments,
  pipelineStages,
} from "@/db/schema";
import { documentFileError, requirementFileTypes } from "@/lib/storage/document-validation";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { conflict, permissionDenied } from "@/lib/errors";
import { InventoryUnavailable } from "@/features/deals/lib/deal-inventory";
import {
  NO_FIRST_MONTH_MESSAGE,
  NO_RESERVATION_MESSAGE,
} from "@/features/deals/lib/stage-transitions";
import { lockDealForInventory, syncBillingInventory } from "../lib/billing-inventory";
import { dealFirstMonthPaid, dealReservationFee, dealReservationPaid } from "../lib/deal-payment";
import { stagesAfterPayment } from "../lib/payment-stage";
import { changeDealStage } from "@/features/deals/actions/deal.actions";
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

const paidSum = (billId: string) =>
  sql<string>`coalesce((select sum(${payments.amount}) from ${payments}
    where ${payments.billId} = ${billId} and ${payments.deletedAt} is null), 0)`;

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
          .select({ paid: paidSum(existing.id) })
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
      await tx.insert(billItems).values(
        value.items.map((item, position) => ({
          billId: saved.id,
          position,
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
    return databaseFailure("The bill could not be saved.");
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
      // All billing changes lock deal, bill, then inventory in the same order as stage moves.
      const [bill] = await tx
        .select({
          id: bills.id,
          dealId: bills.dealId,
          total: sql<string>`${bills.unitPrice} - ${bills.reservationDiscount} + ${bills.miscellaneousFee}`,
        })
        .from(bills)
        .where(and(eq(bills.id, value.billId), eq(bills.organizationId, context.organizationId)))
        .for("update");
      if (!bill) return { kind: "missing" as const };
      const [{ paid, reservationFee, reservationPaid }] = await tx
        .select({
          paid: paidSum(bill.id),
          reservationFee: dealReservationFee,
          reservationPaid: sql<string>`coalesce((select sum(${payments.amount}) from ${payments}
            where ${payments.billId} = ${bill.id} and ${payments.deletedAt} is null
              and ${payments.classification} = 'reservation'), 0)`,
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
        const moved = await changeDealStage({ dealId: outcome.dealId, stageId: stage.id });
        if (!moved.success) {
          stopped =
            moved.error.message === NO_RESERVATION_MESSAGE
              ? "Reservation fee not fully paid yet."
              : moved.error.message === NO_FIRST_MONTH_MESSAGE
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
          "Payment recorded. Automatic updates could not finish; refresh the bill to check its status.",
      });
    }
    if (error instanceof InventoryUnavailable) return failure(conflict(error.message));
    logError("Payment record failed", error, {
      operation: "billing_record_payment",
    });
    return databaseFailure("The payment could not be saved.");
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
      // The stage the deal sits in was reached on its payments; voiding the one it stands on would strand it.
      const gate = deal.isWonStage
        ? dealFirstMonthPaid
        : deal.slug === "reservation"
          ? dealReservationPaid
          : null;
      const gatePaid = async () =>
        gate
          ? (await tx.select({ paid: gate }).from(deals).where(eq(deals.id, deal.id)))[0]?.paid
          : undefined;
      const gateWasMet = await gatePaid();
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
      // Only this void can be refused for it: a gate already unmet (e.g. an older deal) never blocks one.
      if (gateWasMet && (await gatePaid()) === false) throw new StageNeedsPayment();
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "payment",
        entityId: removed.id,
        oldValues: { billId: removed.billId, amount: removed.amount },
      });
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
    return databaseFailure("The payment could not be removed.");
  }
}
