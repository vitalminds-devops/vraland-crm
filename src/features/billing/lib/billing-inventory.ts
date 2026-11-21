import "server-only";

import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { db } from "@/db";
import { bills, deals, pipelineStages, propertyParkingSlots, units } from "@/db/schema";
import { syncDealInventory } from "@/features/deals/lib/deal-inventory";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockDealForInventory(
  tx: Transaction,
  organizationId: string,
  dealId: string,
) {
  const [deal] = await tx
    .select({
      id: deals.id,
      brokerUserId: deals.brokerUserId,
      propertyId: deals.propertyId,
      unitId: deals.unitId,
      unitIds: deals.unitIds,
      parkingSlotIds: deals.parkingSlotIds,
      isWonStage: pipelineStages.isWonStage,
      isLostStage: pipelineStages.isLostStage,
      isCancelledStage: pipelineStages.isCancelledStage,
      position: pipelineStages.position,
      slug: pipelineStages.slug,
    })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(
      and(eq(deals.id, dealId), eq(deals.organizationId, organizationId), isNull(deals.deletedAt)),
    )
    .for("update", { of: deals });
  return deal;
}

/**
 * The refusal when another opportunity already holds one of this deal's units or parking slots:
 * the first to pay takes the inventory, and the others can't be billed for it. Null when free.
 */
export async function inventoryHeldElsewhere(
  tx: Transaction,
  deal: NonNullable<Awaited<ReturnType<typeof lockDealForInventory>>>,
): Promise<string | null> {
  const unitIds = deal.unitIds.length ? deal.unitIds : deal.unitId ? [deal.unitId] : [];
  for (const [table, ids, label] of [
    [units, unitIds, "Unit"],
    [propertyParkingSlots, deal.parkingSlotIds, "Parking slot"],
  ] as const) {
    if (!ids.length) continue;
    const [held] = await tx
      .select({ code: table.code })
      .from(table)
      .where(
        and(
          inArray(table.id, ids),
          isNotNull(table.reservedDealId),
          ne(table.reservedDealId, deal.id),
        ),
      )
      .limit(1);
    if (held)
      return `${label} ${held.code} is already reserved by another opportunity. Pick another ${label.toLowerCase()}.`;
  }
  return null;
}

export async function readDealPayments(tx: Transaction, dealId: string) {
  const [bill] = await tx
    .select({
      total: sql<string>`${bills.unitPrice} - ${bills.reservationDiscount} + ${bills.miscellaneousFee}`,
      paid: sql<string>`coalesce((select sum(p.amount) from payments p where p.bill_id = "bills"."id" and p.deleted_at is null), 0)`,
    })
    .from(bills)
    .where(eq(bills.dealId, dealId));
  return {
    total: Number(bill?.total ?? 0),
    paid: Number(bill?.paid ?? 0),
  };
}

export function isFullyPaid(payment: { total: number; paid: number }): boolean {
  return payment.paid > 0 && payment.total > 0 && payment.paid >= payment.total - 0.004;
}

export function inventoryStatusForDeal(
  stage: {
    slug: string;
    isWonStage: boolean;
    isLostStage: boolean;
    isCancelledStage: boolean;
  },
  payment: { total: number; paid: number },
): "available" | "deposit_paid" | "sold" {
  if (stage.isLostStage || stage.isCancelledStage) return "available";
  if (stage.isWonStage) return "sold";
  if (stage.slug !== "reservation") return "available";
  return isFullyPaid(payment) ? "sold" : "deposit_paid";
}

export async function syncBillingInventory(
  tx: Transaction,
  context: { organizationId: string; userId: string },
  deal: NonNullable<Awaited<ReturnType<typeof lockDealForInventory>>>,
) {
  return syncDealInventory(tx, {
    organizationId: context.organizationId,
    actorUserId: context.userId,
    dealId: deal.id,
    buildingId: deal.propertyId,
    unitIds: deal.unitIds.length ? deal.unitIds : deal.unitId ? [deal.unitId] : [],
    parkingSlotIds: deal.parkingSlotIds,
    status: inventoryStatusForDeal(deal, await readDealPayments(tx, deal.id)),
  });
}
