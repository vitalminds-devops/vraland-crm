import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import {
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
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { contactScopeCondition, dealScopeCondition } from "@/lib/permissions/scope";
import { getMessagingStatus } from "@/lib/messaging/providers";
import {
  DEFAULT_MARKETING_PAGE_SIZE,
  MARKETING_PAGE_SIZES,
  isCampaignChannel,
  isCampaignStatus,
  isSequenceTrigger,
} from "../lib/marketing-meta";
import { maskEnrollment, maskRecipient } from "../lib/recipient-privacy";

function pageBounds(page: number | undefined, pageSize: number | undefined) {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeSize = (MARKETING_PAGE_SIZES as readonly number[]).includes(Number(pageSize))
    ? Number(pageSize)
    : DEFAULT_MARKETING_PAGE_SIZE;
  return {
    page: safePage,
    pageSize: safeSize,
    offset: (safePage - 1) * safeSize,
  };
}

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function pageResult<T>(rows: T[], total: number, page: number, pageSize: number) {
  return {
    rows,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getMarketingSummary() {
  const context = await requirePermission("marketing.view");
  const [
    campaignCount,
    sequenceCount,
    emailCount,
    smsCount,
    activeCampaignCount,
    activeSequenceCount,
  ] = await Promise.all([
    db
      .select({ v: count() })
      .from(campaigns)
      .where(eq(campaigns.organizationId, context.organizationId)),
    db
      .select({ v: count() })
      .from(automationSequences)
      .where(eq(automationSequences.organizationId, context.organizationId)),
    db
      .select({ v: count() })
      .from(emailTemplates)
      .where(eq(emailTemplates.organizationId, context.organizationId)),
    db
      .select({ v: count() })
      .from(smsTemplates)
      .where(eq(smsTemplates.organizationId, context.organizationId)),
    db
      .select({ v: count() })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.organizationId, context.organizationId),
          inArray(campaigns.status, ["scheduled", "running"]),
        ),
      ),
    db
      .select({ v: count() })
      .from(automationSequences)
      .where(
        and(
          eq(automationSequences.organizationId, context.organizationId),
          eq(automationSequences.isActive, true),
        ),
      ),
  ]);
  return {
    campaigns: campaignCount[0]?.v ?? 0,
    sequences: sequenceCount[0]?.v ?? 0,
    emailTemplates: emailCount[0]?.v ?? 0,
    smsTemplates: smsCount[0]?.v ?? 0,
    activeCampaigns: activeCampaignCount[0]?.v ?? 0,
    activeSequences: activeSequenceCount[0]?.v ?? 0,
    providers: getMessagingStatus(),
  };
}

export type CampaignListInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  channel?: string;
};

export async function listCampaigns(input: CampaignListInput = {}) {
  const context = await requirePermission("marketing.view");
  const { page, pageSize, offset } = pageBounds(input.page, input.pageSize);

  const filters: SQL[] = [eq(campaigns.organizationId, context.organizationId)];
  const search = input.search?.trim();
  if (search) filters.push(ilike(campaigns.name, likePattern(search)));
  if (isCampaignStatus(input.status)) filters.push(eq(campaigns.status, input.status));
  if (isCampaignChannel(input.channel)) filters.push(eq(campaigns.channel, input.channel));
  const where = and(...filters);

  const [ids, totalRows] = await Promise.all([
    db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(where)
      .orderBy(desc(campaigns.createdAt), desc(campaigns.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ v: count() }).from(campaigns).where(where),
  ]);
  const total = totalRows[0]?.v ?? 0;
  const idList = ids.map((row) => row.id);

  const rows = idList.length
    ? await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          channel: campaigns.channel,
          status: campaigns.status,
          scheduledAt: campaigns.scheduledAt,
          createdAt: campaigns.createdAt,
          emailTemplateName: emailTemplates.name,
          smsTemplateName: smsTemplates.name,
          recipientCount: sql<number>`count(${campaignRecipients.contactId})::int`,
          sentCount: sql<number>`count(${campaignRecipients.contactId}) filter (where ${campaignRecipients.deliveryStatus} in ('sent','delivered','opened','clicked'))::int`,
          deliveredCount: sql<number>`count(${campaignRecipients.contactId}) filter (where ${campaignRecipients.deliveryStatus} in ('delivered','opened','clicked'))::int`,
          openedCount: sql<number>`count(${campaignRecipients.contactId}) filter (where ${campaignRecipients.deliveryStatus} in ('opened','clicked'))::int`,
          clickedCount: sql<number>`count(${campaignRecipients.contactId}) filter (where ${campaignRecipients.deliveryStatus} = 'clicked')::int`,
          failedCount: sql<number>`count(${campaignRecipients.contactId}) filter (where ${campaignRecipients.deliveryStatus} = 'failed')::int`,
        })
        .from(campaigns)
        .leftJoin(emailTemplates, eq(campaigns.emailTemplateId, emailTemplates.id))
        .leftJoin(smsTemplates, eq(campaigns.smsTemplateId, smsTemplates.id))
        .leftJoin(campaignRecipients, eq(campaigns.id, campaignRecipients.campaignId))
        .where(inArray(campaigns.id, idList))
        .groupBy(campaigns.id, emailTemplates.name, smsTemplates.name)
        .orderBy(desc(campaigns.createdAt), desc(campaigns.id))
    : [];

  return pageResult(rows, total, page, pageSize);
}

/** Recipients shown per page on a campaign. */
export const RECIPIENT_PAGE_SIZE = 100;

export async function getCampaign(id: string, page = 1) {
  const context = await requirePermission("marketing.view");
  const [row] = await db
    .select({
      record: campaigns,
      creatorFirstName: users.firstName,
      creatorLastName: users.lastName,
      emailTemplateName: emailTemplates.name,
      smsTemplateName: smsTemplates.name,
    })
    .from(campaigns)
    .leftJoin(users, eq(campaigns.createdBy, users.id))
    .leftJoin(emailTemplates, eq(campaigns.emailTemplateId, emailTemplates.id))
    .leftJoin(smsTemplates, eq(campaigns.smsTemplateId, smsTemplates.id))
    .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, context.organizationId)))
    .limit(1);
  if (!row) return null;

  // Results stay organization-wide; who received them follows the viewer's data access.
  const { contacts: contactScope } = marketingOptionScopes(context);
  const [recipientRows, statusRows] = await Promise.all([
    db
      .select({
        inScope: sql<boolean>`coalesce(${contactScope}, false)`,
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        mobilePhone: contacts.mobilePhone1,
        status: campaignRecipients.deliveryStatus,
        sentAt: campaignRecipients.sentAt,
        deliveredAt: campaignRecipients.deliveredAt,
        openedAt: campaignRecipients.openedAt,
        clickedAt: campaignRecipients.clickedAt,
        error: campaignRecipients.errorMessage,
      })
      .from(campaignRecipients)
      .innerJoin(contacts, eq(campaignRecipients.contactId, contacts.id))
      .where(eq(campaignRecipients.campaignId, id))
      .orderBy(asc(contacts.lastName), asc(contacts.firstName), asc(contacts.id))
      .limit(RECIPIENT_PAGE_SIZE)
      .offset((page - 1) * RECIPIENT_PAGE_SIZE),
    // The stats cover every recipient, not just the page shown.
    db
      .select({ status: campaignRecipients.deliveryStatus, total: count() })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, id))
      .groupBy(campaignRecipients.deliveryStatus),
  ]);
  const statusCounts = Object.fromEntries(statusRows.map((r) => [r.status, r.total]));

  const creatorName = [row.creatorFirstName, row.creatorLastName].filter(Boolean).join(" ") || null;

  return {
    record: row.record,
    creatorName,
    emailTemplateName: row.emailTemplateName,
    smsTemplateName: row.smsTemplateName,
    recipients: recipientRows.map(maskRecipient),
    statusCounts,
    recipientTotal: statusRows.reduce((sum, r) => sum + r.total, 0),
    canManage: context.permissions.has("marketing.manage"),
  };
}

export type TemplateListInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  active?: string;
};

export async function listEmailTemplates(input: TemplateListInput = {}) {
  const context = await requirePermission("marketing.view");
  const { page, pageSize, offset } = pageBounds(input.page, input.pageSize);
  const filters: SQL[] = [eq(emailTemplates.organizationId, context.organizationId)];
  const search = input.search?.trim();
  if (search) {
    const condition = or(
      ilike(emailTemplates.name, likePattern(search)),
      ilike(emailTemplates.subject, likePattern(search)),
    );
    if (condition) filters.push(condition);
  }
  if (input.category) filters.push(eq(emailTemplates.category, input.category));
  if (input.active === "active") filters.push(eq(emailTemplates.isActive, true));
  if (input.active === "inactive") filters.push(eq(emailTemplates.isActive, false));
  const where = and(...filters);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
        category: emailTemplates.category,
        isActive: emailTemplates.isActive,
        createdAt: emailTemplates.createdAt,
        updatedAt: emailTemplates.updatedAt,
      })
      .from(emailTemplates)
      .where(where)
      .orderBy(desc(emailTemplates.isActive), asc(emailTemplates.name), asc(emailTemplates.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ v: count() }).from(emailTemplates).where(where),
  ]);

  return pageResult(rows, totalRows[0]?.v ?? 0, page, pageSize);
}

export async function listSmsTemplates(input: TemplateListInput = {}) {
  const context = await requirePermission("marketing.view");
  const { page, pageSize, offset } = pageBounds(input.page, input.pageSize);
  const filters: SQL[] = [eq(smsTemplates.organizationId, context.organizationId)];
  const search = input.search?.trim();
  if (search) {
    const condition = or(
      ilike(smsTemplates.name, likePattern(search)),
      ilike(smsTemplates.body, likePattern(search)),
    );
    if (condition) filters.push(condition);
  }
  if (input.category) filters.push(eq(smsTemplates.category, input.category));
  if (input.active === "active") filters.push(eq(smsTemplates.isActive, true));
  if (input.active === "inactive") filters.push(eq(smsTemplates.isActive, false));
  const where = and(...filters);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: smsTemplates.id,
        name: smsTemplates.name,
        body: smsTemplates.body,
        category: smsTemplates.category,
        isActive: smsTemplates.isActive,
        createdAt: smsTemplates.createdAt,
        updatedAt: smsTemplates.updatedAt,
      })
      .from(smsTemplates)
      .where(where)
      .orderBy(desc(smsTemplates.isActive), asc(smsTemplates.name), asc(smsTemplates.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ v: count() }).from(smsTemplates).where(where),
  ]);

  return pageResult(rows, totalRows[0]?.v ?? 0, page, pageSize);
}

export async function getTemplateCategories() {
  const context = await requirePermission("marketing.view");
  const [emailRows, smsRows] = await Promise.all([
    db
      .selectDistinct({ category: emailTemplates.category })
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.organizationId, context.organizationId),
          isNotNull(emailTemplates.category),
        ),
      )
      .orderBy(asc(emailTemplates.category)),
    db
      .selectDistinct({ category: smsTemplates.category })
      .from(smsTemplates)
      .where(
        and(
          eq(smsTemplates.organizationId, context.organizationId),
          isNotNull(smsTemplates.category),
        ),
      )
      .orderBy(asc(smsTemplates.category)),
  ]);
  return {
    email: emailRows
      .map((row) => row.category)
      .filter((value): value is string => Boolean(value?.trim())),
    sms: smsRows
      .map((row) => row.category)
      .filter((value): value is string => Boolean(value?.trim())),
  };
}

export async function getEmailTemplate(id: string) {
  const context = await requirePermission("marketing.view");
  const [record] = await db
    .select()
    .from(emailTemplates)
    .where(
      and(eq(emailTemplates.id, id), eq(emailTemplates.organizationId, context.organizationId)),
    )
    .limit(1);
  if (!record) return null;
  return {
    record,
    canManage: context.permissions.has("marketing.manage"),
  };
}

export async function getSmsTemplate(id: string) {
  const context = await requirePermission("marketing.view");
  const [record] = await db
    .select()
    .from(smsTemplates)
    .where(and(eq(smsTemplates.id, id), eq(smsTemplates.organizationId, context.organizationId)))
    .limit(1);
  if (!record) return null;
  return {
    record,
    canManage: context.permissions.has("marketing.manage"),
  };
}

function marketingOptionScopes(context: Awaited<ReturnType<typeof requirePermission>>) {
  return {
    contacts: contactScopeCondition(context),
    deals: dealScopeCondition(context),
  };
}

export async function getMarketingOptions() {
  const context = await requirePermission("marketing.view");
  const { contacts: contactScope, deals: dealScope } = marketingOptionScopes(context);
  const [emails, sms, contactRows, dealRows] = await Promise.all([
    db
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
        bodyText: emailTemplates.bodyText,
        bodyHtml: emailTemplates.bodyHtml,
      })
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.organizationId, context.organizationId),
          eq(emailTemplates.isActive, true),
        ),
      )
      .orderBy(asc(emailTemplates.name)),
    db
      .select({ id: smsTemplates.id, name: smsTemplates.name, body: smsTemplates.body })
      .from(smsTemplates)
      .where(
        and(
          eq(smsTemplates.organizationId, context.organizationId),
          eq(smsTemplates.isActive, true),
        ),
      )
      .orderBy(asc(smsTemplates.name)),
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        mobilePhone: contacts.mobilePhone1,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, context.organizationId),
          isNull(contacts.deletedAt),
          eq(contacts.marketingConsent, true),
          contactScope,
        ),
      )
      .orderBy(asc(contacts.lastName))
      .limit(1000),
    db
      .select({ id: deals.id, title: deals.title })
      .from(deals)
      .where(
        and(eq(deals.organizationId, context.organizationId), isNull(deals.deletedAt), dealScope),
      )
      .orderBy(asc(deals.title))
      .limit(500),
  ]);
  return {
    // The preview text: the plain version, else the HTML with its tags dropped.
    emailTemplates: emails.map(({ bodyText, bodyHtml, ...template }) => ({
      ...template,
      preview:
        bodyText ||
        bodyHtml
          .replace(/<br\s*\/?>|<\/p>/gi, "\n")
          .replace(/<[^>]*>/g, "")
          .trim(),
    })),
    smsTemplates: sms,
    contacts: contactRows,
    deals: dealRows,
  };
}

export type SequenceListInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  active?: string;
  trigger?: string;
};

export async function listSequences(input: SequenceListInput = {}) {
  const context = await requirePermission("marketing.view");
  const { page, pageSize, offset } = pageBounds(input.page, input.pageSize);

  const filters: SQL[] = [eq(automationSequences.organizationId, context.organizationId)];
  const search = input.search?.trim();
  if (search) {
    const condition = or(
      ilike(automationSequences.name, likePattern(search)),
      ilike(automationSequences.description, likePattern(search)),
    );
    if (condition) filters.push(condition);
  }
  if (input.active === "active") filters.push(eq(automationSequences.isActive, true));
  if (input.active === "inactive") filters.push(eq(automationSequences.isActive, false));
  if (isSequenceTrigger(input.trigger))
    filters.push(eq(automationSequences.triggerType, input.trigger));
  const where = and(...filters);

  const [ids, totalRows] = await Promise.all([
    db
      .select({ id: automationSequences.id })
      .from(automationSequences)
      .where(where)
      .orderBy(asc(automationSequences.name), asc(automationSequences.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ v: count() }).from(automationSequences).where(where),
  ]);
  const total = totalRows[0]?.v ?? 0;
  const idList = ids.map((row) => row.id);

  const rows = idList.length
    ? await db
        .select({
          id: automationSequences.id,
          name: automationSequences.name,
          description: automationSequences.description,
          triggerType: automationSequences.triggerType,
          isActive: automationSequences.isActive,
          createdAt: automationSequences.createdAt,
          stepCount: sql<number>`count(distinct ${automationSteps.id})::int`,
          enrollmentCount: sql<number>`count(distinct ${automationEnrollments.id})::int`,
        })
        .from(automationSequences)
        .leftJoin(automationSteps, eq(automationSequences.id, automationSteps.sequenceId))
        .leftJoin(
          automationEnrollments,
          eq(automationSequences.id, automationEnrollments.sequenceId),
        )
        .where(inArray(automationSequences.id, idList))
        .groupBy(automationSequences.id)
        .orderBy(asc(automationSequences.name), asc(automationSequences.id))
    : [];

  return pageResult(rows, total, page, pageSize);
}

export async function getSequence(id: string) {
  const context = await requirePermission("marketing.view");
  const [record] = await db
    .select()
    .from(automationSequences)
    .where(
      and(
        eq(automationSequences.id, id),
        eq(automationSequences.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  if (!record) return null;
  const { contacts: contactScope, deals: dealScope } = marketingOptionScopes(context);
  const [steps, enrollmentRows, runs, runCount] = await Promise.all([
    db
      .select({
        step: automationSteps,
        emailTemplateName: emailTemplates.name,
        smsTemplateName: smsTemplates.name,
      })
      .from(automationSteps)
      .leftJoin(emailTemplates, eq(automationSteps.emailTemplateId, emailTemplates.id))
      .leftJoin(smsTemplates, eq(automationSteps.smsTemplateId, smsTemplates.id))
      .where(eq(automationSteps.sequenceId, id))
      .orderBy(asc(automationSteps.stepOrder)),
    db
      .select({
        // Visible only when every linked contact and deal is within the viewer's data access.
        inScope: sql<boolean>`(${automationEnrollments.contactId} is null or coalesce(${contactScope}, false))
          and (${automationEnrollments.dealId} is null or coalesce(${dealScope}, false))`,
        id: automationEnrollments.id,
        status: automationEnrollments.status,
        currentStepOrder: automationEnrollments.currentStepOrder,
        enrolledAt: automationEnrollments.enrolledAt,
        completedAt: automationEnrollments.completedAt,
        contactName: sql<string | null>`concat(${contacts.firstName},' ',${contacts.lastName})`,
        dealTitle: deals.title,
      })
      .from(automationEnrollments)
      .leftJoin(contacts, eq(automationEnrollments.contactId, contacts.id))
      .leftJoin(deals, eq(automationEnrollments.dealId, deals.id))
      .where(eq(automationEnrollments.sequenceId, id))
      .orderBy(desc(automationEnrollments.enrolledAt)),
    db
      .select({
        id: automationRuns.id,
        status: automationRuns.status,
        errorMessage: automationRuns.errorMessage,
        metadata: automationRuns.metadata,
        executedAt: automationRuns.executedAt,
        createdAt: automationRuns.createdAt,
        stepOrder: automationSteps.stepOrder,
        actionType: automationSteps.actionType,
      })
      .from(automationRuns)
      .innerJoin(automationEnrollments, eq(automationRuns.enrollmentId, automationEnrollments.id))
      .leftJoin(automationSteps, eq(automationRuns.stepId, automationSteps.id))
      .where(eq(automationEnrollments.sequenceId, id))
      .orderBy(desc(automationRuns.createdAt))
      .limit(50),
    db
      .select({ v: count() })
      .from(automationRuns)
      .innerJoin(automationEnrollments, eq(automationRuns.enrollmentId, automationEnrollments.id))
      .where(eq(automationEnrollments.sequenceId, id)),
  ]);
  return {
    record,
    steps,
    enrollments: enrollmentRows.map(maskEnrollment),
    runs,
    runTotal: runCount[0]?.v ?? 0,
    canManage: context.permissions.has("marketing.manage"),
  };
}
