import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { logError } from "@/lib/logger";
import { manilaToday } from "@/lib/utils/manila-time";
import {
  auditLogs,
  automationEnrollments,
  contacts,
  dealStageHistory,
  deals,
  documents,
  pipelineStages,
} from "@/db/schema";

export const LEAD_EXPIRY_DAYS = 30;
const EXPIRED_NOTE = `Expired after ${LEAD_EXPIRY_DAYS} days in Leads.`;
const BATCH = 200;

/**
 * Leads that entered the Leads stage 30+ days ago expire: the deal closes as lost and the contact is
 * archived for good, so the person needs a new contact record. Their documents are archived too, or
 * the duplicate-upload check would refuse the same ID on the new record. A lead with a recorded
 * payment is being worked and never expires. Safe to run concurrently: rows are claimed with skip locked.
 */
export async function expireStaleLeads(): Promise<number> {
  let expired = 0;
  for (;;) {
    const done = await db.transaction(async (tx) => {
      const stale = await tx
        .select({
          dealId: deals.id,
          organizationId: deals.organizationId,
          stageId: deals.stageId,
          contactId: sql<string | null>`(
            select dc."contact_id" from "deal_contacts" dc
            where dc."deal_id" = "deals"."id" and dc."is_primary" limit 1)`,
        })
        .from(deals)
        .innerJoin(pipelineStages, eq(pipelineStages.id, deals.stageId))
        .where(
          and(
            eq(pipelineStages.slug, "leads"),
            eq(deals.status, "open"),
            isNull(deals.deletedAt),
            // Entered Leads = its latest move into the stage, else when it was opened there.
            sql`coalesce(
              (select max(h."changed_at") from "deal_stage_history" h
               where h."deal_id" = "deals"."id" and h."to_stage_id" = "deals"."stage_id"),
              "deals"."created_at"
            ) <= now() - make_interval(days => ${LEAD_EXPIRY_DAYS})`,
            sql`not exists (
              select 1 from "payments" p inner join "bills" b on b."id" = p."bill_id"
              where b."deal_id" = "deals"."id" and p."deleted_at" is null)`,
            // Without an active Lost stage there is nowhere to close it; the board's stage check restores one.
            sql`exists (
              select 1 from "pipeline_stages" ls
              where ls."organization_id" = "deals"."organization_id"
                and ls."is_lost_stage" and ls."is_active")`,
          ),
        )
        .limit(BATCH)
        .for("update", { of: deals, skipLocked: true });
      if (!stale.length) return true;

      const lostStages = await tx
        .select({ id: pipelineStages.id, organizationId: pipelineStages.organizationId })
        .from(pipelineStages)
        .where(
          and(
            eq(pipelineStages.isLostStage, true),
            eq(pipelineStages.isActive, true),
            inArray(pipelineStages.organizationId, [
              ...new Set(stale.map((s) => s.organizationId)),
            ]),
          ),
        );
      const now = new Date();
      for (const lead of stale) {
        const lostStageId = lostStages.find((s) => s.organizationId === lead.organizationId)?.id;
        if (!lostStageId) continue;
        await tx
          .update(deals)
          .set({
            stageId: lostStageId,
            status: "lost",
            lostNotes: EXPIRED_NOTE,
            actualCloseDate: manilaToday(),
            updatedAt: now,
          })
          .where(eq(deals.id, lead.dealId));
        await tx.insert(dealStageHistory).values({
          dealId: lead.dealId,
          fromStageId: lead.stageId,
          toStageId: lostStageId,
          note: EXPIRED_NOTE,
        });
        if (lead.contactId) {
          // A contact still on another open or won deal stays; only this lead expires.
          const [expiredContact] = await tx
            .update(contacts)
            .set({ deletedAt: now, expiredAt: now, updatedAt: now })
            .where(
              and(
                eq(contacts.id, lead.contactId),
                isNull(contacts.deletedAt),
                sql`not exists (
                  select 1 from "deal_contacts" dc inner join "deals" d on d."id" = dc."deal_id"
                  where dc."contact_id" = ${lead.contactId} and d."id" <> ${lead.dealId}
                    and d."deleted_at" is null and d."status" in ('open', 'won'))`,
              ),
            )
            .returning({ id: contacts.id });
          if (expiredContact) {
            await tx
              .update(documents)
              .set({ archivedAt: now })
              .where(and(eq(documents.contactId, lead.contactId), isNull(documents.archivedAt)));
            // An expired lead gets no more automated emails, SMS or tasks.
            await tx
              .update(automationEnrollments)
              .set({ status: "cancelled", completedAt: now })
              .where(
                and(
                  eq(automationEnrollments.contactId, lead.contactId),
                  eq(automationEnrollments.status, "active"),
                ),
              );
          }
        }
        await tx.insert(auditLogs).values({
          organizationId: lead.organizationId,
          action: "expire",
          entityType: "deal",
          entityId: lead.dealId,
          newValues: { status: "lost", contactId: lead.contactId, note: EXPIRED_NOTE },
        });
      }
      expired += stale.length;
      return stale.length < BATCH;
    });
    if (done) return expired;
  }
}

const HOUR = 60 * 60_000;

/** Runs the expiry at start-up and hourly; called once from instrumentation. */
export function startLeadExpiry(): void {
  const store = globalThis as typeof globalThis & { vraLeadExpiry?: boolean };
  if (store.vraLeadExpiry) return;
  store.vraLeadExpiry = true;
  const run = () =>
    expireStaleLeads()
      .then((count) => {
        if (count)
          console.info(
            `Lead expiry: ${count} lead(s) expired after ${LEAD_EXPIRY_DAYS} days in Leads.`,
          );
      })
      .catch((error) => logError("Lead expiry failed", error, { operation: "lead_expiry" }));
  void run();
  setInterval(run, HOUR).unref?.();
}
