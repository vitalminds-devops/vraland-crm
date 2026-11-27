"use server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  automationEnrollments,
  automationRuns,
  automationSequences,
  automationSteps,
  campaignRecipients,
  campaigns,
  contacts,
  deals,
  emailTemplates,
  smsTemplates,
  tasks,
} from "@/db/schema";
import { lockActiveAssignees } from "@/lib/permissions/active-assignees";
import { requirePermission } from "@/lib/permissions/authorization";
import { contactScopeCondition, dealScopeCondition } from "@/lib/permissions/scope";
import { getEmailProvider, getSmsProvider } from "@/lib/messaging/providers";
import { getUserFacingMessage } from "@/lib/error-handler";
import { redactValue } from "@/lib/audit/redact";
import { deliverCampaign, escapeHtml, render } from "../lib/campaign-delivery";
import { stepDueAt } from "../lib/automation-timing";
import { fromManilaDateTimeLocal, manilaDateTime } from "@/lib/utils/manila-time";
import {
  ActionResult,
  success,
  failure,
  failureFrom,
  validationFailure,
  validationFailureFromZod,
  databaseFailure,
} from "@/lib/types/action-result";
import { ActionErrorCode, conflict, outOfScope } from "@/lib/errors";

export type MarketingResult = ActionResult<{ id: string }>;
const refresh = (path: string) => {
  revalidatePath("/marketing");
  revalidatePath(path);
};
const optionalUuid = z.union([z.uuid(), z.literal(""), z.null()]).transform((v) => v || null);
export async function saveEmailTemplate(input: unknown): Promise<MarketingResult> {
  const c = await requirePermission("marketing.manage");
  const p = z
    .object({
      name: z.string().trim().min(2).max(180),
      subject: z.string().trim().min(1).max(255),
      bodyHtml: z.string().trim().min(1).max(100000),
      bodyText: z.string().trim().max(100000).optional(),
      category: z.string().trim().max(80).optional(),
    })
    .safeParse(input);
  if (!p.success)
    return validationFailureFromZod(p.error, "Enter a name, subject, and email body.");
  try {
    const [r] = await db
      .insert(emailTemplates)
      .values({
        organizationId: c.organizationId,
        ...p.data,
        bodyText: p.data.bodyText || null,
        category: p.data.category || null,
        createdBy: c.userId,
      })
      .returning({ id: emailTemplates.id });
    await audit(c, "create", "email_template", r.id, p.data);
    refresh("/marketing/email-templates");
    return success({ id: r.id });
  } catch {
    return failure(conflict("An email template with this name already exists."));
  }
}
export async function saveSmsTemplate(input: unknown): Promise<MarketingResult> {
  const c = await requirePermission("marketing.manage");
  const p = z
    .object({
      name: z.string().trim().min(2).max(180),
      body: z.string().trim().min(1).max(1600),
      category: z.string().trim().max(80).optional(),
    })
    .safeParse(input);
  if (!p.success) return validationFailureFromZod(p.error, "Enter a name and message body.");
  try {
    const [r] = await db
      .insert(smsTemplates)
      .values({
        organizationId: c.organizationId,
        ...p.data,
        category: p.data.category || null,
        createdBy: c.userId,
      })
      .returning({ id: smsTemplates.id });
    await audit(c, "create", "sms_template", r.id, p.data);
    refresh("/marketing/sms-templates");
    return success({ id: r.id });
  } catch {
    return failure(conflict("An SMS template with this name already exists."));
  }
}
export async function toggleMessageTemplate(
  type: "email" | "sms",
  id: string,
  active: boolean,
): Promise<MarketingResult> {
  const c = await requirePermission("marketing.manage");
  if (type !== "email" && type !== "sms")
    return validationFailure("Choose an email or SMS template.");
  const table = type === "email" ? emailTemplates : smsTemplates;
  const [r] = await db
    .update(table)
    .set({ isActive: active, updatedAt: new Date() })
    .where(and(eq(table.id, id), eq(table.organizationId, c.organizationId)))
    .returning({ id: table.id });
  if (!r) return failureFrom(ActionErrorCode.NOT_FOUND, "Template not found.");
  await audit(c, "update", `${type}_template`, r.id, { isActive: active });
  refresh(`/marketing/${type}-templates`);
  return success({ id: r.id });
}
export async function createCampaign(input: unknown): Promise<MarketingResult> {
  const c = await requirePermission("marketing.manage");
  const p = z
    .object({
      name: z.string().trim().min(2).max(180),
      channel: z.enum(["email", "sms", "social"]),
      emailTemplateId: optionalUuid,
      smsTemplateId: optionalUuid,
      scheduledAt: z
        .string()
        .refine(
          (value) => !value || !Number.isNaN(new Date(value).getTime()),
          "Enter a valid date and time.",
        ),
      contactIds: z.array(z.uuid()).min(1),
    })
    .safeParse(input);
  if (!p.success)
    return validationFailureFromZod(
      p.error,
      "Enter campaign details and select at least one consenting recipient.",
    );
  const v = p.data;
  if (v.channel === "email" && !v.emailTemplateId)
    return validationFailure("Select an email template.");
  if (v.channel === "sms" && !v.smsTemplateId) return validationFailure("Select an SMS template.");
  if (v.emailTemplateId) {
    const [template] = await db
      .select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.id, v.emailTemplateId),
          eq(emailTemplates.organizationId, c.organizationId),
        ),
      )
      .limit(1);
    if (!template) return validationFailure("Select an email template from your organization.");
  }
  if (v.smsTemplateId) {
    const [template] = await db
      .select({ id: smsTemplates.id })
      .from(smsTemplates)
      .where(
        and(
          eq(smsTemplates.id, v.smsTemplateId),
          eq(smsTemplates.organizationId, c.organizationId),
        ),
      )
      .limit(1);
    if (!template) return validationFailure("Select an SMS template from your organization.");
  }
  const recipients = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, c.organizationId),
        eq(contacts.marketingConsent, true),
        isNull(contacts.deletedAt),
        contactScopeCondition(c),
        inArray(contacts.id, v.contactIds),
      ),
    );
  if (recipients.length !== new Set(v.contactIds).size)
    return validationFailure("One or more recipients are unavailable or have not consented.");
  const id = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(campaigns)
      .values({
        organizationId: c.organizationId,
        name: v.name,
        channel: v.channel,
        status: v.scheduledAt ? "scheduled" : "draft",
        emailTemplateId: v.emailTemplateId,
        smsTemplateId: v.smsTemplateId,
        scheduledAt: v.scheduledAt ? fromManilaDateTimeLocal(v.scheduledAt) : null,
        createdBy: c.userId,
      })
      .returning({ id: campaigns.id });
    await tx
      .insert(campaignRecipients)
      .values(recipients.map((x) => ({ campaignId: r.id, contactId: x.id })));
    await tx.insert(auditLogs).values({
      organizationId: c.organizationId,
      actorUserId: c.userId,
      action: "create",
      entityType: "campaign",
      entityId: r.id,
      newValues: {
        name: v.name,
        channel: v.channel,
        recipientCount: recipients.length,
        scheduledAt: v.scheduledAt,
      },
    });
    return r.id;
  });
  refresh("/marketing/campaigns");
  return success({ id });
}
export async function sendCampaign(id: string): Promise<MarketingResult> {
  const c = await requirePermission("marketing.send");
  const result = await deliverCampaign(c.organizationId, id);
  if (!result.success) return result;
  await audit(c, "update", "campaign", id, {
    status: result.data.status,
    processed: result.data.processed,
  });
  refresh(`/marketing/campaigns/${id}`);
  return success({ id });
}

export async function pauseCampaign(id: string): Promise<MarketingResult> {
  const c = await requirePermission("marketing.manage");
  const [campaign] = await db
    .select({ id: campaigns.id, status: campaigns.status })
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, c.organizationId)))
    .limit(1);
  if (!campaign) return failureFrom(ActionErrorCode.NOT_FOUND, "Campaign not found.");
  if (campaign.status === "paused") return failure(conflict("That campaign is already paused."));
  if (campaign.status === "completed")
    return failure(conflict("A completed campaign cannot be paused."));
  const [row] = await db
    .update(campaigns)
    .set({ status: "paused", updatedAt: new Date() })
    .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, c.organizationId)))
    .returning({ id: campaigns.id });
  if (!row) return failureFrom(ActionErrorCode.NOT_FOUND, "Campaign not found.");
  await audit(c, "update", "campaign", row.id, { status: "paused" }, { status: campaign.status });
  refresh("/marketing/campaigns");
  refresh(`/marketing/campaigns/${id}`);
  return success({ id: row.id });
}

export async function deleteCampaign(id: string): Promise<MarketingResult> {
  const c = await requirePermission("marketing.delete");
  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      channel: campaigns.channel,
      status: campaigns.status,
    })
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, c.organizationId)))
    .limit(1);
  if (!campaign) return failureFrom(ActionErrorCode.NOT_FOUND, "Campaign not found.");
  if (["running", "completed"].includes(campaign.status))
    return failure(conflict("Campaigns that started sending can't be deleted."));
  const row = await db.transaction(async (tx) => {
    const [recipients] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, id));
    const [deleted] = await tx
      .delete(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, c.organizationId)))
      .returning({ id: campaigns.id });
    if (deleted)
      await audit(
        c,
        "delete",
        "campaign",
        deleted.id,
        {
          name: campaign.name,
          channel: campaign.channel,
          status: campaign.status,
          recipientCount: recipients?.count ?? 0,
        },
        undefined,
        tx,
      );
    return deleted;
  });
  if (!row) return failureFrom(ActionErrorCode.NOT_FOUND, "Campaign not found.");
  refresh("/marketing/campaigns");
  return success({ id: row.id });
}

export async function deleteSequence(id: string): Promise<MarketingResult> {
  const c = await requirePermission("marketing.delete");
  const outcome = await db.transaction(async (tx) => {
    const [sequence] = await tx
      .select({
        id: automationSequences.id,
        name: automationSequences.name,
        triggerType: automationSequences.triggerType,
        isActive: automationSequences.isActive,
      })
      .from(automationSequences)
      .where(
        and(
          eq(automationSequences.id, id),
          eq(automationSequences.organizationId, c.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!sequence) return { status: "not-found" as const };
    const [enrollments] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(automationEnrollments)
      .where(eq(automationEnrollments.sequenceId, id));
    if ((enrollments?.count ?? 0) > 0) return { status: "refused" as const };
    const [steps] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(automationSteps)
      .where(eq(automationSteps.sequenceId, id));
    const [row] = await tx
      .delete(automationSequences)
      .where(
        and(
          eq(automationSequences.id, id),
          eq(automationSequences.organizationId, c.organizationId),
        ),
      )
      .returning({ id: automationSequences.id });
    if (!row) return { status: "not-found" as const };
    return {
      status: "deleted" as const,
      id: row.id,
      sequence,
      stepCount: steps?.count ?? 0,
    };
  });
  if (outcome.status === "not-found")
    return failureFrom(ActionErrorCode.NOT_FOUND, "Follow-up not found.");
  if (outcome.status === "refused")
    return failure(conflict("A follow-up with people in it can't be deleted."));
  await audit(c, "delete", "automation_sequence", outcome.id, {
    name: outcome.sequence.name,
    triggerType: outcome.sequence.triggerType,
    isActive: outcome.sequence.isActive,
    stepCount: outcome.stepCount,
  });
  refresh("/marketing/automations");
  return success({ id: outcome.id });
}

export async function deleteMessageTemplate(
  type: "email" | "sms",
  id: string,
): Promise<MarketingResult> {
  const c = await requirePermission("marketing.delete");
  if (type !== "email" && type !== "sms")
    return validationFailure("Choose an email or SMS template.");
  const table = type === "email" ? emailTemplates : smsTemplates;
  const campaignColumn = type === "email" ? campaigns.emailTemplateId : campaigns.smsTemplateId;
  const stepColumn =
    type === "email" ? automationSteps.emailTemplateId : automationSteps.smsTemplateId;
  const outcome = await db.transaction(async (tx) => {
    const [template] = await tx
      .select({
        id: table.id,
        name: table.name,
        category: table.category,
        isActive: table.isActive,
      })
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, c.organizationId)))
      .for("update")
      .limit(1);
    if (!template) return { status: "not-found" as const };
    const [campaignUse] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(
        and(
          eq(campaignColumn, id),
          sql`${campaigns.status} <> 'completed'`,
          eq(campaigns.organizationId, c.organizationId),
        ),
      );
    if ((campaignUse?.count ?? 0) > 0) return { status: "used-by-campaign" as const };
    const [stepUse] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(automationSteps)
      .innerJoin(
        automationSequences,
        and(
          eq(automationSteps.sequenceId, automationSequences.id),
          eq(automationSequences.isActive, true),
          eq(automationSequences.organizationId, c.organizationId),
        ),
      )
      .where(eq(stepColumn, id));
    if ((stepUse?.count ?? 0) > 0) return { status: "used-by-sequence" as const };
    const [row] = await tx
      .delete(table)
      .where(and(eq(table.id, id), eq(table.organizationId, c.organizationId)))
      .returning({ id: table.id });
    if (!row) return { status: "not-found" as const };
    return { status: "deleted" as const, id: row.id, template };
  });
  if (outcome.status === "not-found")
    return failureFrom(ActionErrorCode.NOT_FOUND, "Template not found.");
  if (outcome.status === "used-by-campaign")
    return failure(conflict("Template is used by an unfinished campaign."));
  if (outcome.status === "used-by-sequence")
    return failure(conflict("This template is used by a follow-up."));
  await audit(c, "delete", `${type}_template`, outcome.id, {
    name: outcome.template.name,
    category: outcome.template.category,
    isActive: outcome.template.isActive,
  });
  refresh(`/marketing/${type}-templates`);
  return success({ id: outcome.id });
}

export async function createSequence(input: unknown): Promise<MarketingResult> {
  const c = await requirePermission("marketing.manage");
  const p = z
    .object({
      name: z.string().trim().min(2).max(180),
      description: z.string().trim().max(3000).optional(),
      triggerType: z.enum(["lead_created", "deal_stage_changed", "viewing_completed", "manual"]),
    })
    .safeParse(input);
  if (!p.success) return validationFailureFromZod(p.error, "Check the follow-up details.");
  const [r] = await db
    .insert(automationSequences)
    .values({
      organizationId: c.organizationId,
      name: p.data.name,
      description: p.data.description || null,
      triggerType: p.data.triggerType,
      createdBy: c.userId,
    })
    .returning({ id: automationSequences.id });
  await audit(c, "create", "automation_sequence", r.id, p.data);
  refresh("/marketing/automations");
  return success({ id: r.id });
}
export async function addAutomationStep(input: unknown): Promise<MarketingResult> {
  const c = await requirePermission("marketing.manage");
  const p = z
    .object({
      sequenceId: z.uuid(),
      actionType: z.enum(["send_email", "send_sms", "create_task", "wait", "assign_user"]),
      delayMinutes: z.coerce.number().int().min(0),
      emailTemplateId: optionalUuid,
      smsTemplateId: optionalUuid,
      taskTitle: z.string().trim().max(220).optional(),
      configuration: z.string().trim().max(5000).optional(),
    })
    .safeParse(input);
  if (!p.success) return validationFailureFromZod(p.error, "Enter valid step details.");
  const v = p.data;
  const [sequence] = await db
    .select({ id: automationSequences.id })
    .from(automationSequences)
    .where(
      and(
        eq(automationSequences.id, v.sequenceId),
        eq(automationSequences.organizationId, c.organizationId),
      ),
    )
    .limit(1);
  if (!sequence) return failureFrom(ActionErrorCode.NOT_FOUND, "Follow-up not found.");
  if (v.emailTemplateId) {
    const [template] = await db
      .select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.id, v.emailTemplateId),
          eq(emailTemplates.organizationId, c.organizationId),
        ),
      )
      .limit(1);
    if (!template) return validationFailure("Select an email template from your organization.");
  }
  if (v.smsTemplateId) {
    const [template] = await db
      .select({ id: smsTemplates.id })
      .from(smsTemplates)
      .where(
        and(
          eq(smsTemplates.id, v.smsTemplateId),
          eq(smsTemplates.organizationId, c.organizationId),
        ),
      )
      .limit(1);
    if (!template) return validationFailure("Select an SMS template from your organization.");
  }
  const [position] = await db
    .select({
      next: sql<number>`coalesce(max(${automationSteps.stepOrder}),0)::int+1`,
    })
    .from(automationSteps)
    .where(eq(automationSteps.sequenceId, v.sequenceId));
  let config: unknown = {};
  try {
    config = v.configuration ? JSON.parse(v.configuration) : {};
  } catch {
    return validationFailure("Configuration must be valid JSON.");
  }
  const [r] = await db
    .insert(automationSteps)
    .values({
      sequenceId: v.sequenceId,
      stepOrder: position?.next ?? 1,
      actionType: v.actionType,
      delayMinutes: v.delayMinutes,
      emailTemplateId: v.emailTemplateId,
      smsTemplateId: v.smsTemplateId,
      taskTitle: v.taskTitle || null,
      configuration: config,
    })
    .returning({ id: automationSteps.id });
  await audit(c, "create", "automation_step", r.id, {
    sequenceId: v.sequenceId,
    actionType: v.actionType,
    order: position?.next,
  });
  refresh(`/marketing/automations/${v.sequenceId}`);
  return success({ id: r.id });
}
export async function enrollInSequence(input: unknown): Promise<MarketingResult> {
  const c = await requirePermission("marketing.manage");
  const p = z
    .object({
      sequenceId: z.uuid(),
      contactId: optionalUuid,
      dealId: optionalUuid,
    })
    .refine((v) => v.contactId || v.dealId)
    .safeParse(input);
  if (!p.success) return validationFailureFromZod(p.error, "Select a contact or opportunity.");
  const [seq] = await db
    .select({ id: automationSequences.id })
    .from(automationSequences)
    .where(
      and(
        eq(automationSequences.id, p.data.sequenceId),
        eq(automationSequences.organizationId, c.organizationId),
        eq(automationSequences.isActive, true),
      ),
    )
    .limit(1);
  if (!seq) return failureFrom(ActionErrorCode.NOT_FOUND, "This follow-up is not active.");
  if (p.data.contactId) {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, p.data.contactId),
          eq(contacts.organizationId, c.organizationId),
          isNull(contacts.deletedAt),
          contactScopeCondition(c),
        ),
      )
      .limit(1);
    if (!contact) return failure(outOfScope("The selected contact is unavailable."));
  }
  if (p.data.dealId) {
    const [deal] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(
        and(
          eq(deals.id, p.data.dealId),
          eq(deals.organizationId, c.organizationId),
          isNull(deals.deletedAt),
          dealScopeCondition(c),
        ),
      )
      .limit(1);
    if (!deal) return failure(outOfScope("The selected opportunity is unavailable."));
  }
  const { sequenceId, contactId, dealId } = p.data;
  const r = await db.transaction(async (tx) => {
    // Serializes enrolments of the same target, so a double click cannot enrol twice.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`enroll:${sequenceId}:${contactId}:${dealId}`}))`,
    );
    const [active] = await tx
      .select({ id: automationEnrollments.id })
      .from(automationEnrollments)
      .where(
        and(
          eq(automationEnrollments.sequenceId, sequenceId),
          contactId
            ? eq(automationEnrollments.contactId, contactId)
            : isNull(automationEnrollments.contactId),
          dealId ? eq(automationEnrollments.dealId, dealId) : isNull(automationEnrollments.dealId),
          eq(automationEnrollments.status, "active"),
        ),
      )
      .limit(1);
    if (active) return null;
    const [row] = await tx
      .insert(automationEnrollments)
      .values({ sequenceId, contactId, dealId, status: "active", currentStepOrder: 0 })
      .returning({ id: automationEnrollments.id });
    return row;
  });
  if (!r) return failure(conflict("This person is already in this follow-up."));
  await audit(c, "create", "automation_enrollment", r.id, p.data);
  refresh(`/marketing/automations/${p.data.sequenceId}`);
  return success({ id: r.id });
}
export async function executeNextStep(enrollmentId: string): Promise<MarketingResult> {
  const c = await requirePermission("marketing.send");
  const [enrollment] = await db
    .select({
      id: automationEnrollments.id,
      sequenceId: automationEnrollments.sequenceId,
      contactId: automationEnrollments.contactId,
      dealId: automationEnrollments.dealId,
      current: automationEnrollments.currentStepOrder,
      enrolledAt: automationEnrollments.enrolledAt,
    })
    .from(automationEnrollments)
    .innerJoin(
      automationSequences,
      and(
        eq(automationEnrollments.sequenceId, automationSequences.id),
        eq(automationSequences.organizationId, c.organizationId),
      ),
    )
    .where(
      and(eq(automationEnrollments.id, enrollmentId), eq(automationEnrollments.status, "active")),
    )
    .limit(1);
  if (!enrollment)
    return failureFrom(
      ActionErrorCode.NOT_FOUND,
      "This person is no longer in progress in this follow-up.",
    );
  const [step] = await db
    .select()
    .from(automationSteps)
    .where(
      and(
        eq(automationSteps.sequenceId, enrollment.sequenceId),
        sql`${automationSteps.stepOrder}>${enrollment.current ?? 0}`,
      ),
    )
    .orderBy(automationSteps.stepOrder)
    .limit(1);
  const [previous] =
    enrollment.current === null
      ? []
      : await db
          .select({
            actionType: automationSteps.actionType,
            delayMinutes: automationSteps.delayMinutes,
          })
          .from(automationSteps)
          .where(
            and(
              eq(automationSteps.sequenceId, enrollment.sequenceId),
              eq(automationSteps.stepOrder, enrollment.current),
            ),
          )
          .limit(1);
  const [lastRun] = await db
    .select({
      at: sql<Date | null>`max(${automationRuns.executedAt})`.mapWith(automationRuns.executedAt),
    })
    .from(automationRuns)
    .where(eq(automationRuns.enrollmentId, enrollmentId));
  const dueAt = stepDueAt(lastRun?.at ?? enrollment.enrolledAt, step ?? null, previous ?? null);
  if (dueAt > new Date())
    return failure(conflict(`The next step can run after ${manilaDateTime(dueAt)} (Manila time).`));
  if (!step) {
    await db
      .update(automationEnrollments)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(automationEnrollments.id, enrollmentId));
    await audit(c, "update", "automation_enrollment", enrollmentId, {
      status: "completed",
      sequenceId: enrollment.sequenceId,
      reason: "no_more_steps",
    });
    refresh(`/marketing/automations/${enrollment.sequenceId}`);
    return success({ id: enrollmentId });
  }
  // Advance the enrollment first, so a second click finds no step to run.
  const [claimed] = await db
    .update(automationEnrollments)
    .set({ currentStepOrder: step.stepOrder })
    .where(
      and(
        eq(automationEnrollments.id, enrollmentId),
        eq(automationEnrollments.status, "active"),
        enrollment.current === null
          ? isNull(automationEnrollments.currentStepOrder)
          : eq(automationEnrollments.currentStepOrder, enrollment.current),
      ),
    )
    .returning({ id: automationEnrollments.id });
  if (!claimed) return failure(conflict("This step is already running."));
  const [run] = await db
    .insert(automationRuns)
    .values({ enrollmentId, stepId: step.id, status: "running" })
    .returning({ id: automationRuns.id });
  try {
    if (step.actionType === "create_task") {
      // The follow-up belongs to the contact's agent, else the opportunity's, not whoever ran the step.
      const [owner] = enrollment.contactId
        ? await db
            .select({ userId: contacts.assignedUserId })
            .from(contacts)
            .where(and(eq(contacts.id, enrollment.contactId), isNull(contacts.deletedAt)))
            .limit(1)
        : [];
      // An archived or expired contact gets no new work, the same as email and SMS steps.
      if (enrollment.contactId && !owner) throw new Error("Contact unavailable");
      const [deal] =
        !owner?.userId && enrollment.dealId
          ? await db
              .select({ userId: deals.primaryAgentUserId })
              .from(deals)
              .where(eq(deals.id, enrollment.dealId))
              .limit(1)
          : [];
      const assignedUserId = owner?.userId ?? deal?.userId ?? c.userId;
      await db.transaction(async (tx) => {
        await lockActiveAssignees(tx, c.organizationId, [assignedUserId]);
        await tx.insert(tasks).values({
          organizationId: c.organizationId,
          title: step.taskTitle || "Automated follow-up",
          taskType: "follow_up",
          priority: "medium",
          assignedUserId,
          createdBy: c.userId,
          contactId: enrollment.contactId,
          dealId: enrollment.dealId,
        });
      });
    } else if (step.actionType === "send_email" || step.actionType === "send_sms") {
      const provider = step.actionType === "send_email" ? getEmailProvider() : getSmsProvider();
      if (!provider)
        throw new Error(
          step.actionType === "send_email"
            ? "Email provider configuration required"
            : "SMS provider configuration required",
        );
      const [contact] = enrollment.contactId
        ? await db
            .select({
              firstName: contacts.firstName,
              email: contacts.email,
              phone: contacts.mobilePhone1,
            })
            .from(contacts)
            .where(
              and(
                eq(contacts.id, enrollment.contactId),
                eq(contacts.organizationId, c.organizationId),
                eq(contacts.marketingConsent, true),
                isNull(contacts.deletedAt),
              ),
            )
            .limit(1)
        : [];
      if (!contact) throw new Error("Contact unavailable or has not consented");
      if (step.actionType === "send_email") {
        const [template] = step.emailTemplateId
          ? await db
              .select()
              .from(emailTemplates)
              .where(eq(emailTemplates.id, step.emailTemplateId))
              .limit(1)
          : [];
        if (!contact.email || !template) throw new Error("Email address or template unavailable");
        await getEmailProvider()!.send({
          to: contact.email,
          subject: render(template.subject, contact.firstName),
          html: render(template.bodyHtml, escapeHtml(contact.firstName)),
          text: template.bodyText ? render(template.bodyText, contact.firstName) : undefined,
        });
      } else {
        const [template] = step.smsTemplateId
          ? await db
              .select()
              .from(smsTemplates)
              .where(eq(smsTemplates.id, step.smsTemplateId))
              .limit(1)
          : [];
        if (!contact.phone || !template) throw new Error("Phone number or template unavailable");
        await getSmsProvider()!.send({
          to: contact.phone,
          body: render(template.body, contact.firstName),
        });
      }
    }
    await db
      .update(automationRuns)
      .set({
        status: step.actionType === "wait" ? "queued" : "success",
        executedAt: new Date(),
        metadata: {
          delayMinutes: step.delayMinutes,
          configuration: step.configuration,
        },
      })
      .where(eq(automationRuns.id, run.id));
    refresh(`/marketing/automations/${enrollment.sequenceId}`);
    return success({ id: run.id });
  } catch (error) {
    const message = getUserFacingMessage(error);
    await db
      .update(automationRuns)
      .set({ status: "failed", executedAt: new Date(), errorMessage: message })
      .where(eq(automationRuns.id, run.id));
    await db
      .update(automationEnrollments)
      .set({ status: "failed" })
      .where(eq(automationEnrollments.id, enrollmentId));
    await audit(c, "update", "automation_enrollment", enrollmentId, {
      status: "failed",
      sequenceId: enrollment.sequenceId,
      runId: run.id,
      errorMessage: message,
    });
    refresh(`/marketing/automations/${enrollment.sequenceId}`);
    return databaseFailure(message);
  }
}
async function audit(
  c: { organizationId: string; userId: string },
  action: string,
  entityType: string,
  entityId: string,
  newValues: unknown,
  oldValues?: unknown,
  executor: Pick<typeof db, "insert"> = db,
) {
  await executor.insert(auditLogs).values({
    organizationId: c.organizationId,
    actorUserId: c.userId,
    action,
    entityType,
    entityId,
    oldValues: oldValues ? redactRecord(oldValues) : null,
    newValues: newValues ? redactRecord(newValues) : null,
  });
}

function redactRecord(values: unknown): Record<string, unknown> {
  if (!values || typeof values !== "object") return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values as Record<string, unknown>))
    result[key] = redactValue(key, value);
  return result;
}
