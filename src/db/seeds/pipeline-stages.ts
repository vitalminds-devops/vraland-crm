import { and, asc, count, eq, isNull, lt, sql } from "drizzle-orm";
import {
  bills,
  dealStageChangeRequests,
  dealStageHistory,
  deals,
  payments,
  pipelineStages,
} from "../schema";
import type { db } from "../client";

/** Drizzle transaction handle, so the stages share the caller's transaction. */
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The pipeline every organization has, in order. The app keeps the database in step with it. */
export const defaultPipelineStages = [
  {
    name: "Leads",
    slug: "leads",
    probability: 10,
    isWon: false,
    isLost: false,
    isCancelled: false,
    requiresApproval: false,
  },
  {
    name: "Opportunity",
    slug: "opportunity",
    probability: 40,
    isWon: false,
    isLost: false,
    isCancelled: false,
    requiresApproval: false,
  },
  {
    name: "Reservation",
    slug: "reservation",
    probability: 60,
    isWon: false,
    isLost: false,
    isCancelled: false,
    requiresApproval: false,
  },
  {
    name: "CTS Signed - Won",
    slug: "closed-won",
    probability: 100,
    isWon: true,
    isLost: false,
    isCancelled: false,
    requiresApproval: true,
  },
  {
    name: "Closed - Lost",
    slug: "closed-lost",
    probability: 0,
    isWon: false,
    isLost: true,
    isCancelled: false,
    requiresApproval: false,
  },
] as const;

export async function seedPipelineStages(tx: DbTransaction, organizationId: string) {
  const [merged] = await tx
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(
      and(
        eq(pipelineStages.organizationId, organizationId),
        eq(pipelineStages.slug, "opportunity"),
        eq(pipelineStages.name, "Opportunity & Reservation"),
      ),
    );
  // Positions are unique per organization: park the current ones below zero so the defaults can take 1..n.
  await tx
    .update(pipelineStages)
    .set({ position: sql`-${pipelineStages.position}` })
    .where(
      and(eq(pipelineStages.organizationId, organizationId), sql`${pipelineStages.position} > 0`),
    );
  for (const [position, stage] of defaultPipelineStages.entries()) {
    await tx
      .insert(pipelineStages)
      .values({
        organizationId,
        name: stage.name,
        slug: stage.slug,
        position: position + 1,
        defaultProbability: String(stage.probability),
        isWonStage: stage.isWon,
        isLostStage: stage.isLost,
        isCancelledStage: stage.isCancelled,
        isActive: true,
        requiresApproval: stage.requiresApproval,
      })
      .onConflictDoUpdate({
        target: [pipelineStages.organizationId, pipelineStages.slug],
        set: {
          name: stage.name,
          position: position + 1,
          defaultProbability: String(stage.probability),
          isWonStage: stage.isWon,
          isLostStage: stage.isLost,
          isCancelledStage: stage.isCancelled,
          isActive: true,
          requiresApproval: stage.requiresApproval,
          updatedAt: new Date(),
        },
      });
  }
  if (merged) await splitReservation(tx, organizationId, merged.id);
  const notes = await retireMergedStages(tx, organizationId);
  await placeLeftoverStages(tx, organizationId, defaultPipelineStages.length);
  return notes;
}

/** Once "Opportunity & Reservation" is split: deals with a Reservation (or Full) payment go to Reservation. */
async function splitReservation(tx: DbTransaction, organizationId: string, opportunityId: string) {
  const [reservation] = await tx
    .select({ id: pipelineStages.id, probability: pipelineStages.defaultProbability })
    .from(pipelineStages)
    .where(
      and(
        eq(pipelineStages.organizationId, organizationId),
        eq(pipelineStages.slug, "reservation"),
      ),
    );
  const moved = await tx
    .update(deals)
    .set({ stageId: reservation.id, probability: reservation.probability, updatedAt: new Date() })
    .where(
      and(
        eq(deals.stageId, opportunityId),
        sql`exists (select 1 from ${bills} b join ${payments} p on p.bill_id = b.id
          where b.deal_id = ${deals.id} and p.deleted_at is null
            and p.classification in ('reservation', 'full_payment'))`,
      ),
    )
    .returning({ id: deals.id });
  if (moved.length)
    await tx.insert(dealStageHistory).values(
      moved.map((deal) => ({
        dealId: deal.id,
        fromStageId: opportunityId,
        toStageId: reservation.id,
        note: "Moved to Reservation: reservation paid.",
      })),
    );
}

/**
 * Retires the old "Cancelled" stage. Stages are deactivated, not deleted, so history that points at
 * them stays intact. Safe to run more than once.
 */
async function retireMergedStages(tx: DbTransaction, organizationId: string): Promise<string[]> {
  const notes: string[] = [];
  const [cancelled] = await tx
    .select()
    .from(pipelineStages)
    .where(
      and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.slug, "cancelled")),
    );

  if (cancelled?.isActive) {
    const [held] = await tx
      .select({ value: count() })
      .from(deals)
      .where(and(eq(deals.stageId, cancelled.id), isNull(deals.deletedAt)));
    // Hiding the stage would hide these deals from every list and report.
    if (held.value > 0) {
      notes.push(
        `"Cancelled" still holds ${held.value} deal(s); left active. Move them, then run again.`,
      );
      return notes;
    }
    await tx
      .update(dealStageChangeRequests)
      .set({
        status: "cancelled",
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dealStageChangeRequests.toStageId, cancelled.id),
          eq(dealStageChangeRequests.status, "pending"),
        ),
      );
    await tx
      .update(pipelineStages)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(pipelineStages.id, cancelled.id));
    notes.push("Cancelled stage removed.");
  }
  return notes;
}

/** Stages the defaults did not rewrite (retired or custom) keep their order, after the defaults. */
async function placeLeftoverStages(
  tx: DbTransaction,
  organizationId: string,
  defaultCount: number,
) {
  const leftovers = await tx
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(and(eq(pipelineStages.organizationId, organizationId), lt(pipelineStages.position, 0)))
    // Parked as -position, so ordering by -position restores the original order.
    .orderBy(asc(sql`-${pipelineStages.position}`));
  for (const [index, stage] of leftovers.entries())
    await tx
      .update(pipelineStages)
      .set({ position: defaultCount + index + 1 })
      .where(eq(pipelineStages.id, stage.id));
}
