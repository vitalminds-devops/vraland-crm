import "server-only";

import { addDays, addMonths, format, parseISO, startOfMonth } from "date-fns";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  notExists,
  sql,
  sum,
} from "drizzle-orm";

import { db } from "@/db";
import { activeLead } from "@/features/contacts/lib/contact-stage-sql";
import {
  activities,
  contacts,
  deals,
  developments,
  organizations,
  pipelineStages,
  properties,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { superAdministratorRoleSlug } from "@/lib/permissions/catalog";
import { hasOrganizationWideAccess, type AuthorizationContext } from "@/lib/permissions/policy";
import { grantedPropertyCondition } from "@/lib/permissions/property-access";
import { dataScopeCondition, scopedAgentCondition } from "@/lib/permissions/scope";
import { manilaDate, manilaMidnight } from "@/lib/utils/manila-time";
import { leadNotArchived } from "@/features/deals/lib/lead-not-archived";
import { arimaForecast, monthlySalesHistory } from "../lib/arima-forecast";
import { safeRate } from "../lib/report-metrics";
import type { ReportFilters } from "../schemas/report-filter.schema";

const number = (value: string | number | null | undefined) => Number(value ?? 0);
const endExclusive = (date: string) => format(addDays(parseISO(date), 1), "yyyy-MM-dd");

async function reportContext() {
  const context = await requirePermission("reports.view");
  const [organization] = await db
    .select({ currency: organizations.currency })
    .from(organizations)
    .where(eq(organizations.id, context.organizationId))
    .limit(1);
  return {
    context,
    currency: organization?.currency ?? "PHP",
    organizationWide: hasOrganizationWideAccess(context),
  };
}

function excludeSuperAdministrators() {
  return notExists(
    db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, users.id), eq(roles.slug, superAdministratorRoleSlug))),
  );
}

export async function getReportOptions() {
  const { context, organizationWide } = await reportContext();
  const userScope = organizationWide ? undefined : scopedAgentCondition(context);
  const [agentRows, developmentRows, propertyTypeRows] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        current: sql<boolean>`${users.status} = 'active' and ${users.deletedAt} is null`,
      })
      .from(users)
      .where(
        and(
          eq(users.organizationId, context.organizationId),
          // Departed agents with deals stay pickable: the agent report still lists them.
          sql`((${users.status} = 'active' and ${users.deletedAt} is null) or exists (select 1 from "deals" d where d."primary_agent_user_id" = ${users.id} and d."deleted_at" is null))`,
          excludeSuperAdministrators(),
          userScope,
        ),
      )
      .orderBy(asc(users.firstName), asc(users.lastName)),
    db
      .select({ id: developments.id, name: developments.name })
      .from(developments)
      .where(eq(developments.organizationId, context.organizationId))
      .orderBy(asc(developments.name)),
    db
      .selectDistinct({ value: properties.propertyType })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          organizationWide
            ? undefined
            : dataScopeCondition(context, {
                organizationId: properties.organizationId,
              }),
          grantedPropertyCondition(context, { propertyId: properties.id }),
        ),
      )
      .orderBy(asc(properties.propertyType)),
  ]);
  return {
    agents: agentRows.map((row) => ({
      id: row.id,
      name: `${row.firstName} ${row.lastName}${row.current ? "" : " (inactive)"}`,
    })),
    developments: developmentRows,
    propertyTypes: propertyTypeRows.map((row) => row.value),
  };
}

/**
 * A deal belongs to a development through its own field, or through the building of its units:
 * one rule for every report, so a deal with no unit yet still counts.
 */
const dealInDevelopment = (developmentId: string) =>
  sql`(${deals.developmentId} = ${developmentId} or exists (select 1 from properties p where p.id = ${deals.propertyId} and p.development_id = ${developmentId}))`;

const dealScopeFor = (context: AuthorizationContext) =>
  dataScopeCondition(context, {
    organizationId: deals.organizationId,
    ownerUserId: deals.primaryAgentUserId,
    brokerUserId: deals.brokerUserId,
  });

/** `closedLimit` caps the closed-deal list: the page shows the latest 25, an export takes them all. */
export async function getSalesReport(filters: ReportFilters, closedLimit = 25) {
  const { context, currency, organizationWide } = await reportContext();
  const dealScope = organizationWide ? undefined : dealScopeFor(context);
  const propertyFilters = and(
    filters.development ? dealInDevelopment(filters.development) : undefined,
    filters.propertyType
      ? sql`exists (select 1 from properties p where p.id = ${deals.propertyId} and p.organization_id = ${context.organizationId} and p.property_type = ${filters.propertyType})`
      : undefined,
  );
  const base = and(
    eq(deals.organizationId, context.organizationId),
    isNull(deals.deletedAt),
    // Same rule as the dashboard: an archived client takes its opportunities out of the counts.
    leadNotArchived,
    dealScope,
    filters.agent ? eq(deals.primaryAgentUserId, filters.agent) : undefined,
    propertyFilters,
  );
  const closed = and(
    base,
    eq(deals.status, "won"),
    gte(deals.actualCloseDate, filters.from),
    lt(deals.actualCloseDate, endExclusive(filters.to)),
  );
  const month = sql<string>`date_trunc('month', ${deals.actualCloseDate}::timestamp)::date`;
  const [summaryRows, pipelineRows, expectedRows, trendRows, closedRows] = await Promise.all([
    db
      .select({
        count: count(),
        value: sum(deals.amount),
        average: sql<string>`coalesce(avg(${deals.amount}), 0)`,
      })
      .from(deals)
      .where(closed),
    db
      .select({ count: count(), value: sum(deals.amount) })
      .from(deals)
      .where(and(base, eq(deals.status, "open"))),
    db
      .select({ count: count(), value: sum(deals.amount) })
      .from(deals)
      .where(
        and(
          base,
          eq(deals.status, "open"),
          // Looks ahead whatever the period: an expected date already past is overdue, not expected.
          gte(deals.expectedCloseDate, manilaDate()),
          lt(deals.expectedCloseDate, format(addDays(parseISO(manilaDate()), 30), "yyyy-MM-dd")),
        ),
      ),
    db
      .select({ month, count: count(), value: sum(deals.amount) })
      .from(deals)
      .where(closed)
      .groupBy(month)
      .orderBy(asc(month)),
    db
      .select({
        id: deals.id,
        title: deals.title,
        amount: deals.amount,
        actualCloseDate: deals.actualCloseDate,
        agentFirstName: users.firstName,
        agentLastName: users.lastName,
        propertyTitle: properties.title,
      })
      .from(deals)
      .leftJoin(users, eq(deals.primaryAgentUserId, users.id))
      .leftJoin(properties, eq(deals.propertyId, properties.id))
      .where(closed)
      .orderBy(desc(deals.actualCloseDate), desc(deals.createdAt))
      .limit(closedLimit),
  ]);
  const summary = summaryRows[0];
  return {
    currency,
    summary: {
      closedDeals: summary?.count ?? 0,
      salesValue: number(summary?.value),
      averageDealValue: number(summary?.average),
      pipelineDeals: pipelineRows[0]?.count ?? 0,
      pipelineValue: number(pipelineRows[0]?.value),
      expectedClosings: expectedRows[0]?.count ?? 0,
      expectedClosingValue: number(expectedRows[0]?.value),
    },
    trend: trendRows.map((row) => ({
      month: String(row.month).slice(0, 7),
      deals: row.count,
      value: number(row.value),
    })),
    closedDeals: closedRows.map((row) => ({
      id: row.id,
      title: row.title,
      amount: number(row.amount),
      actualCloseDate: row.actualCloseDate,
      agentName: [row.agentFirstName, row.agentLastName].filter(Boolean).join(" ") || "Unassigned",
      propertyTitle: row.propertyTitle,
    })),
  };
}

export async function getForecastReport(filters: ReportFilters) {
  const { context, currency, organizationWide } = await reportContext();
  const cutoff = startOfMonth(parseISO(filters.to < manilaDate() ? filters.to : manilaDate()));
  const cutoffDate = format(cutoff, "yyyy-MM-dd");
  const common = and(
    eq(deals.organizationId, context.organizationId),
    eq(deals.currency, currency),
    isNull(deals.deletedAt),
    // Same rule as the dashboard: an archived client takes its opportunities out of the counts.
    leadNotArchived,
    organizationWide ? undefined : dealScopeFor(context),
    filters.agent ? eq(deals.primaryAgentUserId, filters.agent) : undefined,
    filters.development ? dealInDevelopment(filters.development) : undefined,
    filters.propertyType
      ? sql`exists (select 1 from properties p where p.id = ${deals.propertyId} and p.organization_id = ${context.organizationId} and p.property_type = ${filters.propertyType})`
      : undefined,
  );
  const base = and(
    common,
    eq(deals.status, "open"),
    gte(deals.expectedCloseDate, filters.from),
    lt(deals.expectedCloseDate, endExclusive(filters.to)),
  );
  const month = sql<string>`to_char(${deals.expectedCloseDate}, 'YYYY-MM')`;
  const salesMonth = sql<string>`to_char(${deals.actualCloseDate}, 'YYYY-MM')`;
  const weighted = sql<string>`coalesce(sum(coalesce(${deals.amount}, 0) * (${deals.probability} / 100.0)), 0)`;
  const [summaryRows, monthRows, stageRows, historyRows] = await Promise.all([
    db
      .select({ deals: count(), gross: sum(deals.amount), weighted })
      .from(deals)
      .where(base),
    db
      .select({ month, gross: sum(deals.amount), weighted, deals: count() })
      .from(deals)
      .where(base)
      .groupBy(month)
      .orderBy(asc(month)),
    db
      .select({
        stage: pipelineStages.name,
        gross: sum(deals.amount),
        weighted,
        deals: count(),
      })
      .from(deals)
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(base)
      .groupBy(pipelineStages.id)
      .orderBy(desc(weighted)),
    db
      .select({ month: salesMonth, value: sum(deals.amount) })
      .from(deals)
      .where(
        and(
          common,
          eq(deals.status, "won"),
          gte(deals.actualCloseDate, format(addMonths(cutoff, -36), "yyyy-MM-dd")),
          lt(deals.actualCloseDate, cutoffDate),
        ),
      )
      .groupBy(salesMonth)
      .orderBy(asc(salesMonth)),
  ]);
  const summary = summaryRows[0];
  const history = monthlySalesHistory(
    historyRows.map((row) => ({ month: row.month, value: number(row.value) })),
    format(cutoff, "yyyy-MM"),
  );
  const arima = arimaForecast(history.map((point) => point.value));
  return {
    currency,
    arima: {
      model: arima?.model ?? null,
      observations: history.length,
      trainedThrough: format(addMonths(cutoff, -1), "yyyy-MM"),
      history: history.slice(-12),
      forecast:
        arima?.forecast.map((point, index) => ({
          month: format(addMonths(cutoff, index), "yyyy-MM"),
          ...point,
        })) ?? [],
    },
    summary: {
      deals: summary?.deals ?? 0,
      gross: number(summary?.gross),
      weighted: number(summary?.weighted),
    },
    monthly: monthRows.map((row) => ({
      month: String(row.month).slice(0, 7),
      gross: number(row.gross),
      weighted: number(row.weighted),
      deals: row.deals,
    })),
    stages: stageRows.map((row) => ({
      stage: row.stage,
      gross: number(row.gross),
      weighted: number(row.weighted),
      deals: row.deals,
    })),
  };
}

export async function getAgentReport(filters: ReportFilters) {
  const { context, currency, organizationWide } = await reportContext();
  // The same data scope as the sales report, so a team lead sees their team in both.
  const userScope = organizationWide ? undefined : scopedAgentCondition(context);
  const scopedUserIds = db.select({ id: users.id }).from(users).where(userScope);
  const [agentRows, leadRows, dealRows, activityRows] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        current: sql<boolean>`${users.status} = 'active' and ${users.deletedAt} is null`,
      })
      .from(users)
      .where(
        and(
          eq(users.organizationId, context.organizationId),
          excludeSuperAdministrators(),
          userScope,
          filters.agent ? eq(users.id, filters.agent) : undefined,
        ),
      )
      .orderBy(asc(users.firstName)),
    db
      .select({
        userId: contacts.assignedUserId,
        leads: count(),
        activeLeads: sql<number>`count(*) filter (where ${activeLead})`,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, context.organizationId),
          isNull(contacts.deletedAt),
          gte(contacts.createdAt, manilaMidnight(filters.from)),
          lt(contacts.createdAt, manilaMidnight(endExclusive(filters.to))),
          organizationWide
            ? undefined
            : dataScopeCondition(context, {
                organizationId: contacts.organizationId,
                ownerUserId: contacts.assignedUserId,
                brokerUserId: contacts.brokerUserId,
              }),
          filters.agent ? eq(contacts.assignedUserId, filters.agent) : undefined,
        ),
      )
      .groupBy(contacts.assignedUserId),
    db
      .select({
        userId: deals.primaryAgentUserId,
        deals: sql<number>`count(*) filter (where ${deals.createdAt} >= ${manilaMidnight(filters.from)} and ${deals.createdAt} < ${manilaMidnight(endExclusive(filters.to))})`,
        closed: sql<number>`count(*) filter (where ${deals.status} = 'won' and ${deals.actualCloseDate} >= ${filters.from} and ${deals.actualCloseDate} < ${endExclusive(filters.to)})`,
        sales: sql<string>`coalesce(sum(${deals.amount}) filter (where ${deals.status} = 'won' and ${deals.actualCloseDate} >= ${filters.from} and ${deals.actualCloseDate} < ${endExclusive(filters.to)}), 0)`,
      })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          isNull(deals.deletedAt),
          // Same rule as the dashboard: an archived client takes its opportunities out of the counts.
          leadNotArchived,
          organizationWide ? undefined : dealScopeFor(context),
          filters.agent ? eq(deals.primaryAgentUserId, filters.agent) : undefined,
        ),
      )
      .groupBy(deals.primaryAgentUserId),
    db
      .select({ userId: activities.actorUserId, activities: count() })
      .from(activities)
      .where(
        and(
          eq(activities.organizationId, context.organizationId),
          gte(activities.createdAt, manilaMidnight(filters.from)),
          lt(activities.createdAt, manilaMidnight(endExclusive(filters.to))),
          organizationWide ? undefined : inArray(activities.actorUserId, scopedUserIds),
          filters.agent ? eq(activities.actorUserId, filters.agent) : undefined,
        ),
      )
      .groupBy(activities.actorUserId),
  ]);
  const leads = new Map(leadRows.map((row) => [row.userId, row]));
  const dealMetrics = new Map(dealRows.map((row) => [row.userId, row]));
  const activityMetrics = new Map(activityRows.map((row) => [row.userId, row]));
  const agents = agentRows
    // A deactivated or archived agent stays listed for a period they had results in.
    .filter(
      (agent) =>
        agent.current ||
        leads.has(agent.id) ||
        Number(dealMetrics.get(agent.id)?.deals ?? 0) > 0 ||
        Number(dealMetrics.get(agent.id)?.closed ?? 0) > 0 ||
        activityMetrics.has(agent.id),
    )
    .map((agent) => {
      const lead = leads.get(agent.id);
      const deal = dealMetrics.get(agent.id);
      return {
        id: agent.id,
        name: `${agent.firstName} ${agent.lastName}`,
        activeLeads: lead?.activeLeads ?? 0,
        deals: deal?.deals ?? 0,
        closedDeals: deal?.closed ?? 0,
        salesValue: number(deal?.sales),
        conversionRate: safeRate(deal?.closed ?? 0, lead?.leads ?? 0),
        activities: activityMetrics.get(agent.id)?.activities ?? 0,
      };
    })
    .sort((a, b) => b.salesValue - a.salesValue || b.closedDeals - a.closedDeals);
  return { currency, agents };
}

/** The pipeline stages the funnel follows, in order, with the label used when a stage is missing. */
const funnelStages = [
  {
    key: "opportunity",
    label: "Opportunity",
    reached: ["opportunity", "reservation", "closed-won"],
  },
  { key: "reservation", label: "Reservation", reached: ["reservation", "closed-won"] },
] as const;

/**
 * Whether one of the contact's deals is in one of `slugs` now or passed through one, so a deal that
 * later moved on, or was lost, still counts for the stages it reached.
 */
function reachedStage(
  contactId: typeof contacts.id,
  organizationId: string,
  slugs: readonly string[],
) {
  const list = sql.join(
    slugs.map((slug) => sql`${slug}`),
    sql`, `,
  );
  return sql`exists (
    select 1 from deal_contacts dc
    join deals d on d.id = dc.deal_id
    join pipeline_stages cur on cur.id = d.stage_id
    where dc.contact_id = ${contactId} and d.organization_id = ${organizationId} and d.deleted_at is null
      and (cur.slug in (${list}) or exists (
        select 1 from deal_stage_history h
        join pipeline_stages ps on ps.id = h.to_stage_id
        where h.deal_id = d.id and ps.slug in (${list})
      ))
  )`;
}

export async function getConversionReport(filters: ReportFilters) {
  const { context, organizationWide } = await reportContext();
  const contactScope = organizationWide
    ? undefined
    : dataScopeCondition(context, {
        organizationId: contacts.organizationId,
        ownerUserId: contacts.assignedUserId,
        brokerUserId: contacts.brokerUserId,
      });
  const propertyFilter =
    filters.development || filters.propertyType
      ? sql`and exists (select 1 from properties p2 where (${filters.development ? sql`p2.development_id = ${filters.development}` : sql`true`}) and (${filters.propertyType ? sql`p2.property_type = ${filters.propertyType}` : sql`true`}) and (exists (select 1 from property_viewings pv2 where pv2.property_id = p2.id and pv2.contact_id = ${contacts.id}) or exists (select 1 from deal_contacts dc2 join deals d2 on d2.id = dc2.deal_id where dc2.contact_id = ${contacts.id} and d2.property_id = p2.id and d2.organization_id = ${context.organizationId})))`
      : sql``;
  const base = and(
    eq(contacts.organizationId, context.organizationId),
    isNull(contacts.deletedAt),
    gte(contacts.createdAt, manilaMidnight(filters.from)),
    lt(contacts.createdAt, manilaMidnight(endExclusive(filters.to))),
    contactScope,
    filters.agent ? eq(contacts.assignedUserId, filters.agent) : undefined,
    sql`true ${propertyFilter}`,
  );
  const [rows, stageRows] = await Promise.all([
    db
      .select({
        leads: countDistinct(contacts.id),
        opportunity: sql<number>`count(distinct ${contacts.id}) filter (where ${reachedStage(contacts.id, context.organizationId, funnelStages[0].reached)})`,
        reservation: sql<number>`count(distinct ${contacts.id}) filter (where ${reachedStage(contacts.id, context.organizationId, funnelStages[1].reached)})`,
        closed: sql<number>`count(distinct ${contacts.id}) filter (where exists (select 1 from deal_contacts dc join deals d on d.id = dc.deal_id where dc.contact_id = ${contacts.id} and d.status = 'won' and d.deleted_at is null and d.organization_id = ${context.organizationId}))`,
      })
      .from(contacts)
      .where(base),
    db
      .select({ slug: pipelineStages.slug, name: pipelineStages.name })
      .from(pipelineStages)
      .where(eq(pipelineStages.organizationId, context.organizationId)),
  ]);
  const row = rows[0] ?? { leads: 0, opportunity: 0, reservation: 0, closed: 0 };
  // Labels follow the organization's own stage names, e.g. "CTS Signed - Won".
  const stageName = (slug: string, fallback: string) =>
    stageRows.find((stage) => stage.slug === slug)?.name ?? fallback;
  const wonLabel = stageName("closed-won", "Won");
  const funnel = [
    { key: "leads", label: stageName("leads", "Leads"), value: Number(row.leads) },
    ...funnelStages.map((stage) => ({
      key: stage.key,
      label: stageName(stage.key, stage.label),
      value: Number(row[stage.key]),
    })),
    { key: "closed", label: wonLabel, value: Number(row.closed) },
  ];
  return {
    funnel,
    wonLabel,
    overallRate: safeRate(row.closed, row.leads),
  };
}
