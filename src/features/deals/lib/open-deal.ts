import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  contacts,
  dealContacts,
  deals,
  dealStageHistory,
  developments,
  pipelineStages,
} from "@/db/schema";
import { dealTitleFor } from "./deal-label";
import { lockActiveAssignees } from "@/lib/permissions/active-assignees";
import type { AuthorizationContext } from "@/lib/permissions/policy";
import { failure, success, type ActionResult } from "@/lib/types/action-result";
import { conflict, outOfScope } from "@/lib/errors";
import type { ContactDealInput } from "../schemas/deal.schema";

/** Drizzle transaction handle shared by the deal-opening helpers. */
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type OpenDealForContactInput = {
  contactId: string;
  /** Human label used to build the default deal title (e.g. "Maria Santos"). */
  contactName: string;
  /** Agent inherited from the contact; becomes the deal's primary agent. */
  primaryAgentUserId: string | null;
  /** Optional stage override; defaults to the first active pipeline stage. */
  stageId?: string | null;
  dealType?: ContactDealInput["dealType"];
  title?: string | null;
  /** Open another deal even when the contact has one (a second tower or development). */
  another?: boolean;
};

export type OpenDealForContactResult = ActionResult<{
  id: string;
  created: boolean;
}>;

export async function openDealForApprovedContact(
  tx: DbTransaction,
  context: AuthorizationContext,
  input: OpenDealForContactInput,
): Promise<OpenDealForContactResult> {
  const [existing] = await tx
    .select({ id: deals.id })
    .from(deals)
    .innerJoin(
      dealContacts,
      and(eq(dealContacts.dealId, deals.id), eq(dealContacts.contactId, input.contactId)),
    )
    .where(and(eq(deals.organizationId, context.organizationId), isNull(deals.deletedAt)))
    .limit(1);
  if (existing && !input.another) return success({ id: existing.id, created: false });

  const [stage] = await tx
    .select()
    .from(pipelineStages)
    .where(
      and(
        input.stageId ? eq(pipelineStages.id, input.stageId) : undefined,
        eq(pipelineStages.organizationId, context.organizationId),
        eq(pipelineStages.isActive, true),
      ),
    )
    .orderBy(asc(pipelineStages.position))
    .limit(1);
  if (!stage)
    return failure(
      conflict("No active pipeline stage is configured, so a deal could not be opened."),
    );

  const dealType = input.dealType ?? "sale";

  const [contact] = await tx
    .select({
      brokerUserId: contacts.brokerUserId,
      preferredDevelopmentId: contacts.preferredDevelopmentId,
    })
    .from(contacts)
    .where(
      and(eq(contacts.id, input.contactId), eq(contacts.organizationId, context.organizationId)),
    )
    .limit(1);
  if (!contact) return failure(outOfScope("That contact is not in your organization."));
  // Another opportunity starts empty; its development is picked when it moves to Opportunity.
  const [development] =
    !input.another && contact?.preferredDevelopmentId
      ? await tx
          .select({ id: developments.id, name: developments.name })
          .from(developments)
          .where(
            and(
              eq(developments.id, contact.preferredDevelopmentId),
              eq(developments.organizationId, context.organizationId),
            ),
          )
          .limit(1)
      : [];
  const title = input.title?.trim()
    ? input.title.trim()
    : dealTitleFor(input.contactName, development?.name ?? null);
  await lockActiveAssignees(tx, context.organizationId, [
    input.primaryAgentUserId,
    contact.brokerUserId,
  ]);

  const [row] = await tx
    .insert(deals)
    .values({
      organizationId: context.organizationId,
      dealCode: `DEAL-${randomUUID().toUpperCase()}`,
      title,
      dealType,
      stageId: stage.id,
      developmentId: development?.id ?? null,
      primaryAgentUserId: input.primaryAgentUserId,
      brokerUserId: contact?.brokerUserId ?? null,
      probability: stage.defaultProbability,
      createdBy: context.userId,
      updatedBy: context.userId,
    })
    .returning({ id: deals.id });
  await tx.insert(dealContacts).values({
    dealId: row.id,
    contactId: input.contactId,
    role: dealType === "sale" ? "buyer" : "tenant",
    isPrimary: true,
  });
  await tx.insert(dealStageHistory).values({
    dealId: row.id,
    toStageId: stage.id,
    changedBy: context.userId,
    note: input.another
      ? "Another opportunity opened for this client"
      : "Lead created",
  });
  await tx.insert(activities).values({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    activityType: "deal.created",
    summary: `${title} was opened in ${stage.name}.`,
    dealId: row.id,
  });
  await tx.insert(auditLogs).values({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    action: "create",
    entityType: "deal",
    entityId: row.id,
    newValues: {
      title,
      stageId: stage.id,
      contactId: input.contactId,
      developmentId: development?.id ?? null,
    },
  });
  return success({ id: row.id, created: true });
}
