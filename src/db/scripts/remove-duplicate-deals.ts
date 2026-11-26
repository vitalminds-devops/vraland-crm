import "../../config/load-environment";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { closeDatabaseConnection, db } from "../client";
import { auditLogs, dealContacts, deals } from "../schema";
import {
  planDuplicateDeals,
  type DuplicateDealCandidate,
} from "../../features/deals/lib/duplicate-deals";

// Contacts created before the duplicate fix can have two open deals: the one opened on approval
// and the one the form's Deal section added. Keeps the worked-on one and soft-deletes the empty
// extra; a duplicate with a bill, offer or task is reported, never removed.
// Usage: npm run db:remove-duplicate-deals            (preview, changes nothing)
//        npm run db:remove-duplicate-deals -- --apply
const apply = process.argv.includes("--apply");

try {
  const rows = await db
    .select({
      contactId: dealContacts.contactId,
      organizationId: deals.organizationId,
      id: deals.id,
      dealCode: deals.dealCode,
      createdAt: deals.createdAt,
      stageChanges: sql<number>`(select count(*)::int from deal_stage_history h where h.deal_id = ${deals.id})`,
      agents: sql<number>`(select count(*)::int from deal_agents a where a.deal_id = ${deals.id})`,
      // A client may hold one opportunity per development; "Add opportunity" ones are on purpose.
      // Notes written by open-deal.ts; older rows say "client".
      intentional: sql<boolean>`exists (select 1 from deal_stage_history h where h.deal_id = ${deals.id} and h.note in ('Another opportunity opened for this contact', 'Another opportunity opened for this client'))`,
      attachments: sql<number>`(
        (select count(*) from bills b where b.deal_id = ${deals.id})
        + (select count(*) from offers o where o.deal_id = ${deals.id})
        + (select count(*) from tasks t where t.deal_id = ${deals.id} and t.deleted_at is null)
      )::int`,
    })
    .from(deals)
    .innerJoin(
      dealContacts,
      and(eq(dealContacts.dealId, deals.id), eq(dealContacts.isPrimary, true)),
    )
    .where(and(isNull(deals.deletedAt), eq(deals.status, "open")));

  const byContact = new Map<string, (DuplicateDealCandidate & { organizationId: string })[]>();
  for (const row of rows)
    byContact.set(row.contactId, [...(byContact.get(row.contactId) ?? []), row]);

  const toRemove: { id: string; organizationId: string }[] = [];
  for (const [contactId, group] of byContact) {
    if (group.length < 2) continue;
    const plan = planDuplicateDeals(group);
    // Only intentional opportunities left: nothing here is a duplicate.
    if (!plan.keep) continue;
    console.info(
      `Contact ${contactId}: keep ${plan.keep.dealCode}` +
        (plan.remove.length ? `, remove ${plan.remove.map((d) => d.dealCode).join(", ")}` : "") +
        (plan.blocked.length
          ? `, left alone (has a bill, offer or task): ${plan.blocked.map((d) => d.dealCode).join(", ")}`
          : ""),
    );
    toRemove.push(
      ...plan.remove.map((deal) => ({
        id: deal.id,
        organizationId: group[0].organizationId,
      })),
    );
  }

  if (!toRemove.length) console.info("No removable duplicate deals.");
  else if (!apply)
    console.info(
      `${toRemove.length} deal(s) would be removed. Run again with --apply to remove them.`,
    );
  else {
    await db.transaction(async (tx) => {
      await tx
        .update(deals)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          inArray(
            deals.id,
            toRemove.map((deal) => deal.id),
          ),
        );
      await tx.insert(auditLogs).values(
        toRemove.map((deal) => ({
          organizationId: deal.organizationId,
          action: "delete",
          entityType: "deal",
          entityId: deal.id,
          newValues: { reason: "Duplicate deal for the same contact" },
        })),
      );
    });
    console.info(`${toRemove.length} duplicate deal(s) removed.`);
  }
} finally {
  await closeDatabaseConnection();
}
