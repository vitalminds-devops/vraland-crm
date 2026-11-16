import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import { automationEnrollments, automationSequences, dealContacts } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SequenceTrigger = "lead_created" | "deal_stage_changed" | "viewing_completed";

/**
 * Enrolls a contact and/or deal into every active sequence started by `trigger`, inside the
 * caller's transaction. Same guard as enrolling by hand: one active enrollment per sequence and
 * target, under the same lock. A deal without a contact given brings its primary contact.
 */
export async function enrollByTrigger(
  tx: Tx,
  input: {
    organizationId: string;
    trigger: SequenceTrigger;
    contactId?: string | null;
    dealId?: string | null;
  },
) {
  const sequences = await tx
    .select({ id: automationSequences.id })
    .from(automationSequences)
    .where(
      and(
        eq(automationSequences.organizationId, input.organizationId),
        eq(automationSequences.triggerType, input.trigger),
        eq(automationSequences.isActive, true),
      ),
    );
  if (!sequences.length) return 0;
  const dealId = input.dealId ?? null;
  let contactId = input.contactId ?? null;
  if (!contactId && dealId) {
    const [primary] = await tx
      .select({ contactId: dealContacts.contactId })
      .from(dealContacts)
      .where(and(eq(dealContacts.dealId, dealId), eq(dealContacts.isPrimary, true)))
      .limit(1);
    contactId = primary?.contactId ?? null;
  }
  let enrolled = 0;
  for (const sequence of sequences) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`enroll:${sequence.id}:${contactId}:${dealId}`}))`,
    );
    const [active] = await tx
      .select({ id: automationEnrollments.id })
      .from(automationEnrollments)
      .where(
        and(
          eq(automationEnrollments.sequenceId, sequence.id),
          contactId
            ? eq(automationEnrollments.contactId, contactId)
            : isNull(automationEnrollments.contactId),
          dealId ? eq(automationEnrollments.dealId, dealId) : isNull(automationEnrollments.dealId),
          eq(automationEnrollments.status, "active"),
        ),
      )
      .limit(1);
    if (active) continue;
    await tx.insert(automationEnrollments).values({
      sequenceId: sequence.id,
      contactId,
      dealId,
      status: "active",
      currentStepOrder: 0,
    });
    enrolled++;
  }
  return enrolled;
}
