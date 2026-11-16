import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import { bills, deals, pipelineStages } from "@/db/schema";
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
      opportunityPosition: sql<number>`coalesce((select position from pipeline_stages where organization_id = ${organizationId} and slug = 'opportunity' limit 1), 2147483647)`,
    })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(
      and(eq(deals.id, dealId), eq(deals.organizationId, organizationId), isNull(deals.deletedAt)),
    )
    .for("update", { of: deals });
  return deal;
}

export async function readDealPayments(tx: Transaction, dealId: string) {
  const [bill] = await tx
    .select({
      total: sql<string>`${bills.unitPrice} - ${bills.reservationDiscount} + ${bills.miscellaneousFee}`,
      paid: sql<string>`coalesce((select sum(p.amount) from payments p where p.bill_id = "bills"."id" and p.deleted_at is null), 0)`,
    })
    .from(bills)
    .where(eq(bills.dealId, dealId));
  return { total: Number(bill?.total ?? 0), paid: Number(bill?.paid ?? 0) };
}

export function isFullyPaid(payment: { total: number; paid: number }): boolean {
  return payment.paid > 0 && payment.total > 0 && payment.paid >= payment.total - 0.004;
}

export function inventoryStatusForDeal(
  stage: {
    isWonStage: boolean;
    isLostStage: boolean;
    isCancelledStage: boolean;
    position: number;
    opportunityPosition: number;
  },
  payment: { total: number; paid: number },
): "available" | "deposit_paid" | "sold" {
  if (stage.isLostStage || stage.isCancelledStage) return "available";
  if (stage.isWonStage || isFullyPaid(payment)) return "sold";
  return payment.paid > 0 || stage.position >= stage.opportunityPosition
    ? "deposit_paid"
    : "available";
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
