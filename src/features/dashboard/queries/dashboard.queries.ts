import "server-only";

import { addDays, format, parseISO } from "date-fns";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
  sum,
} from "drizzle-orm";

import { db } from "@/db";
import { visibleActivityPrefixes } from "../lib/activity-modules";
import { activeLead } from "@/features/contacts/lib/contact-stage-sql";
import {
  activities,
  bills,
  calendarEvents,
  contacts,
  deals,
  floors,
  organizations,
  payments,
  pipelineStages,
  properties,
  propertyParkingSlots,
  propertyViewings,
  tasks,
  units,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import {
  grantedParkingCondition,
  grantedPropertyCondition,
  grantedFloorsCondition,
  grantedUnitsCondition,
} from "@/lib/permissions/property-access";
import { hasOrganizationWideAccess, resolveDataScope } from "@/lib/permissions/policy";
import {
  dataScopeCondition,
  contactScopeCondition,
  dealScopeCondition,
} from "@/lib/permissions/scope";
import { rankPriorities, revenueSeries } from "../lib/dashboard-shaping";
import {
  manilaDate,
  startOfManilaDay,
  startOfManilaMonth,
  startOfManilaWeek,
} from "@/lib/utils/manila-time";
import { taskDueToday, taskOverdue } from "@/features/tasks/lib/task-predicates";
import { dashboardSections } from "@/lib/permissions/view-access";
import { leadNotArchived } from "@/features/deals/lib/lead-not-archived";
import { formatMoneyShort } from "@/lib/utils/money";
import { percentageChange, rate } from "../lib/metrics";
import { ensurePipelineStages } from "@/features/deals/lib/ensure-pipeline-stages";

type MonthlyAmount = { month: string; value: string };

export type DashboardReading = {
  key: string;
  label: string;
  value: string;
  hint: string;
  tone?: "attention";
};

export async function getDashboardData() {
  const context = await requirePermission("dashboard.view");
  await ensurePipelineStages(context.organizationId);
  const now = new Date();
  const monthStart = startOfManilaMonth(now);
  const nextMonthStart = startOfManilaMonth(now, 1);
  const previousMonthStart = startOfManilaMonth(now, -1);
  const todayStart = startOfManilaDay(now);
  const priorityWindowEnd = new Date(startOfManilaDay(now, 8).getTime() - 1);
  const closingWindowEnd = addDays(now, 30);
  const tomorrowStart = startOfManilaDay(now, 1);
  const weekStart = startOfManilaWeek(now);
  // The last Manila calendar day of this month, for date columns.
  const monthEndDate = manilaDate(addDays(nextMonthStart, -1));
  const organizationWide = hasOrganizationWideAccess(context);

  const canViewDeals = context.permissions.has("deals.view");
  const canViewContacts = context.permissions.has("contacts.view");
  const canViewProperties = context.permissions.has("properties.view");
  const canViewTasks = context.permissions.has("tasks.view");
  const canViewCalendar = context.permissions.has("calendar.view");

  const contactScope = organizationWide ? undefined : contactScopeCondition(context);
  const propertyScope = organizationWide
    ? undefined
    : dataScopeCondition(context, {
        organizationId: properties.organizationId,
      });
  const dealAccess = organizationWide ? undefined : dealScopeCondition(context);
  const dealScope = and(dealAccess, leadNotArchived);
  // Closed outcomes count whatever became of the contact: lead expiry archives it, and archiving
  // must not rewrite how many were won or lost in a past month.
  const taskScope = organizationWide ? undefined : eq(tasks.assignedUserId, context.userId);
  // Every contact created, whatever became of it: converting must not shrink a past month.
  const newContactCondition = and(
    eq(contacts.organizationId, context.organizationId),
    isNull(contacts.deletedAt),
    contactScope,
  );
  const activeLeadCondition = and(
    eq(contacts.organizationId, context.organizationId),
    activeLead,
    isNull(contacts.deletedAt),
    contactScope,
  );
  const monthExpression = sql<string>`date_trunc('month', ${deals.actualCloseDate}::timestamp)::date`;
  const forecastMonthExpression = sql<string>`date_trunc('month', ${deals.expectedCloseDate}::timestamp)::date`;

  const visibleContactIds = db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, context.organizationId),
        isNull(contacts.deletedAt),
        contactScope,
      ),
    );
  const visiblePropertyIds = db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
        grantedPropertyCondition(context, { propertyId: properties.id }),
        propertyScope,
      ),
    );
  const visibleDealIds = db
    .select({ id: deals.id })
    .from(deals)
    .where(
      and(eq(deals.organizationId, context.organizationId), isNull(deals.deletedAt), dealScope),
    );
  const visibleTaskIds = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(eq(tasks.organizationId, context.organizationId), isNull(tasks.deletedAt), taskScope),
    );
  // Each user sees activity only from the modules they can open, even with all-records access.
  const activityPrefixes = visibleActivityPrefixes((key) => context.permissions.has(key));
  const activityModules = activityPrefixes.length
    ? inArray(sql`split_part(${activities.activityType}, '.', 1)`, activityPrefixes)
    : sql`false`;
  const activityScope = organizationWide
    ? undefined
    : or(
        eq(activities.actorUserId, context.userId),
        inArray(activities.contactId, visibleContactIds),
        inArray(activities.propertyId, visiblePropertyIds),
        inArray(activities.dealId, visibleDealIds),
        inArray(activities.taskId, visibleTaskIds),
      );

  const [
    organizationRows,
    activeLeadRows,
    newLeadRows,
    previousLeadRows,
    propertyRows,
    collectedRows,
    closedSalesRows,
    forecastRows,
    stageRows,
    taskRows,
    viewingRows,
    activityRows,
    overdueTaskRows,
    upcomingViewingRows,
    wonRows,
    lostRows,
    reservedPropertyRows,
    closingSoonRows,
    taskLoadRows,
    completedTaskRows,
    inventoryStatusRows,
    reservationRows,
    floorRows,
    wonTotalRows,
    wonCollectedRows,
    monthlyPaidRows,
    unitAvailabilityRows,
    parkingAvailabilityRows,
  ] = await Promise.all([
    db
      .select({ currency: organizations.currency })
      .from(organizations)
      .where(eq(organizations.id, context.organizationId))
      .limit(1),
    db.select({ value: count() }).from(contacts).where(activeLeadCondition),
    db
      .select({ value: count() })
      .from(contacts)
      .where(
        and(
          newContactCondition,
          gte(contacts.createdAt, monthStart),
          lt(contacts.createdAt, nextMonthStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(contacts)
      .where(
        and(
          newContactCondition,
          gte(contacts.createdAt, previousMonthStart),
          lt(contacts.createdAt, monthStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          eq(properties.status, "active"),
          isNull(properties.deletedAt),
          grantedPropertyCondition(context, { propertyId: properties.id }),
          propertyScope,
        ),
      ),
    db
      .select({ count: count(), value: sum(payments.amount) })
      .from(payments)
      .innerJoin(bills, eq(bills.id, payments.billId))
      .innerJoin(deals, eq(deals.id, bills.dealId))
      .where(
        and(
          eq(payments.organizationId, context.organizationId),
          isNull(payments.deletedAt),
          gte(payments.paidOn, manilaDate(monthStart)),
          lte(payments.paidOn, monthEndDate),
          isNull(deals.deletedAt),
          dealScope,
        ),
      ),
    db
      .select({ month: monthExpression, value: sum(deals.amount) })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "won"),
          gte(deals.actualCloseDate, manilaDate(startOfManilaMonth(now, -5))),
          isNull(deals.deletedAt),
          dealScope,
        ),
      )
      .groupBy(monthExpression)
      .orderBy(asc(monthExpression)) as Promise<MonthlyAmount[]>,
    db
      .select({
        month: forecastMonthExpression,
        value: sql<string>`coalesce(sum(${deals.amount} * (${deals.probability} / 100.0)), 0)`,
      })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "open"),
          gte(deals.expectedCloseDate, manilaDate(monthStart)),
          lt(deals.expectedCloseDate, manilaDate(startOfManilaMonth(now, 6))),
          isNull(deals.deletedAt),
          dealScope,
        ),
      )
      .groupBy(forecastMonthExpression)
      .orderBy(asc(forecastMonthExpression)) as Promise<MonthlyAmount[]>,
    db
      .select({ name: pipelineStages.name, value: count(deals.id) })
      .from(pipelineStages)
      .leftJoin(
        deals,
        and(
          eq(deals.stageId, pipelineStages.id),
          eq(deals.organizationId, context.organizationId),
          isNull(deals.deletedAt),
          dealScope,
        ),
      )
      .where(
        and(
          eq(pipelineStages.organizationId, context.organizationId),
          eq(pipelineStages.isActive, true),
        ),
      )
      .groupBy(pipelineStages.id)
      .orderBy(asc(pipelineStages.position)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        type: tasks.taskType,
        priority: tasks.priority,
        dueAt: tasks.dueAt,
        status: tasks.status,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, context.organizationId),
          notInArray(tasks.status, ["completed", "cancelled"]),
          lte(tasks.dueAt, priorityWindowEnd),
          isNull(tasks.deletedAt),
          taskScope,
        ),
      )
      .orderBy(
        asc(tasks.dueAt),
        sql`case ${tasks.priority} when 'urgent' then 1 when 'high' then 2 when 'medium' then 3 else 4 end`,
      )
      .limit(8),
    db
      .select({
        id: propertyViewings.id,
        title: calendarEvents.title,
        type: sql<string>`'viewing'`,
        priority: sql<string>`'high'`,
        dueAt: calendarEvents.startAt,
        status: propertyViewings.status,
      })
      .from(propertyViewings)
      .innerJoin(calendarEvents, eq(propertyViewings.eventId, calendarEvents.id))
      .where(
        and(
          eq(calendarEvents.organizationId, context.organizationId),
          inArray(propertyViewings.status, ["scheduled", "confirmed"]),
          gte(calendarEvents.startAt, todayStart),
          lte(calendarEvents.startAt, priorityWindowEnd),
          organizationWide ? undefined : eq(propertyViewings.agentUserId, context.userId),
        ),
      )
      .orderBy(asc(calendarEvents.startAt))
      .limit(8),
    db
      .select({
        id: activities.id,
        type: activities.activityType,
        summary: activities.summary,
        createdAt: activities.createdAt,
        actorFirstName: users.firstName,
        actorLastName: users.lastName,
      })
      .from(activities)
      .leftJoin(users, eq(activities.actorUserId, users.id))
      .where(
        and(eq(activities.organizationId, context.organizationId), activityModules, activityScope),
      )
      .orderBy(desc(activities.createdAt))
      .limit(8),
    db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, context.organizationId),
          taskOverdue(now),
          isNull(tasks.deletedAt),
          taskScope,
        ),
      ),
    db
      .select({ value: count() })
      .from(propertyViewings)
      .innerJoin(calendarEvents, eq(propertyViewings.eventId, calendarEvents.id))
      .where(
        and(
          eq(calendarEvents.organizationId, context.organizationId),
          inArray(propertyViewings.status, ["scheduled", "confirmed"]),
          gte(calendarEvents.startAt, todayStart),
          lte(calendarEvents.startAt, priorityWindowEnd),
          organizationWide ? undefined : eq(propertyViewings.agentUserId, context.userId),
        ),
      ),
    db
      .select({ count: count(), value: sum(deals.amount) })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "won"),
          gte(deals.actualCloseDate, manilaDate(monthStart)),
          lte(deals.actualCloseDate, monthEndDate),
          isNull(deals.deletedAt),
          dealAccess,
        ),
      ),
    db
      .select({ value: count() })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "lost"),
          gte(deals.actualCloseDate, manilaDate(monthStart)),
          lte(deals.actualCloseDate, monthEndDate),
          isNull(deals.deletedAt),
          dealAccess,
        ),
      ),
    db
      .select({ value: count() })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          inArray(properties.status, ["reserved", "under_contract"]),
          isNull(properties.deletedAt),
          grantedPropertyCondition(context, { propertyId: properties.id }),
          propertyScope,
        ),
      ),
    db
      .select({
        id: deals.id,
        title: deals.title,
        amount: deals.amount,
        expectedCloseDate: deals.expectedCloseDate,
        probability: deals.probability,
        stageName: pipelineStages.name,
        agentFirstName: users.firstName,
        agentLastName: users.lastName,
      })
      .from(deals)
      .leftJoin(pipelineStages, eq(pipelineStages.id, deals.stageId))
      .leftJoin(users, eq(users.id, deals.primaryAgentUserId))
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "open"),
          isNull(deals.deletedAt),
          gte(deals.expectedCloseDate, manilaDate(now)),
          lte(deals.expectedCloseDate, manilaDate(closingWindowEnd)),
          dealScope,
        ),
      )
      .orderBy(asc(deals.expectedCloseDate))
      .limit(6),
    db
      .select({
        overdue: sql<number>`count(*) filter (where ${taskOverdue(now)})::int`,
        dueToday: sql<number>`count(*) filter (where ${taskDueToday(now)})::int`,
        thisWeek: sql<number>`count(*) filter (where ${tasks.dueAt} >= ${tomorrowStart} and ${tasks.dueAt} <= ${priorityWindowEnd})::int`,
        unscheduled: sql<number>`count(*) filter (where ${tasks.dueAt} is null)::int`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, context.organizationId),
          notInArray(tasks.status, ["completed", "cancelled"]),
          isNull(tasks.deletedAt),
          taskScope,
        ),
      ),
    db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, context.organizationId),
          eq(tasks.status, "completed"),
          gte(tasks.completedAt, weekStart),
          isNull(tasks.deletedAt),
          taskScope,
        ),
      ),
    db
      .select({ status: properties.status, value: count() })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          grantedPropertyCondition(context, { propertyId: properties.id }),
          propertyScope,
        ),
      )
      .groupBy(properties.status)
      .orderBy(desc(count())),
    // Reservation payments received this month.
    db
      .select({ count: count(), value: sum(payments.amount) })
      .from(payments)
      .innerJoin(bills, eq(bills.id, payments.billId))
      .innerJoin(deals, eq(deals.id, bills.dealId))
      .where(
        and(
          eq(payments.organizationId, context.organizationId),
          isNull(payments.deletedAt),
          eq(payments.classification, "reservation"),
          gte(payments.paidOn, manilaDate(monthStart)),
          lte(payments.paidOn, monthEndDate),
          isNull(deals.deletedAt),
          dealScope,
        ),
      ),
    // Floors of the properties the viewer can see, and how many properties have them.
    db
      .select({
        floors: count(),
        properties: sql<number>`count(distinct ${floors.propertyId})::int`,
      })
      .from(floors)
      .innerJoin(properties, eq(floors.propertyId, properties.id))
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          // Floor by floor: an agent given 2 floors of a tower counts 2, like the unit meters.
          grantedFloorsCondition(context, { propertyId: floors.propertyId, floorId: floors.id }),
          propertyScope,
        ),
      ),
    // Every won opportunity, all time.
    db
      .select({ count: count(), value: sum(deals.amount) })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "won"),
          isNull(deals.deletedAt),
          dealScope,
        ),
      ),
    // What has been collected on those won opportunities.
    db
      .select({ value: sum(payments.amount) })
      .from(payments)
      .innerJoin(bills, eq(bills.id, payments.billId))
      .innerJoin(deals, eq(deals.id, bills.dealId))
      .where(
        and(
          eq(payments.organizationId, context.organizationId),
          isNull(payments.deletedAt),
          eq(deals.status, "won"),
          isNull(deals.deletedAt),
          dealScope,
        ),
      ),
    // Monthly amortization payments received, all time.
    db
      .select({ count: count(), value: sum(payments.amount) })
      .from(payments)
      .innerJoin(bills, eq(bills.id, payments.billId))
      .innerJoin(deals, eq(deals.id, bills.dealId))
      .where(
        and(
          eq(payments.organizationId, context.organizationId),
          isNull(payments.deletedAt),
          eq(payments.classification, "monthly"),
          isNull(deals.deletedAt),
          dealScope,
        ),
      ),
    // Units the viewer can see, and how many are still available.
    db
      .select({
        total: count(),
        available: sql<number>`(count(*) filter (where ${units.status} = 'available'))::int`,
      })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          grantedUnitsCondition(context, {
            propertyId: units.propertyId,
            floorId: units.floorId,
            unitId: units.id,
          }),
          propertyScope,
        ),
      ),
    // Parking slots the viewer can see, and how many are still available.
    db
      .select({
        total: count(),
        available: sql<number>`(count(*) filter (where ${propertyParkingSlots.status} = 'available'))::int`,
      })
      .from(propertyParkingSlots)
      .innerJoin(properties, eq(propertyParkingSlots.propertyId, properties.id))
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          grantedParkingCondition(context, {
            propertyId: propertyParkingSlots.propertyId,
            parkingSlotId: propertyParkingSlots.id,
          }),
          propertyScope,
        ),
      ),
  ]);

  const sections = dashboardSections((key) => context.permissions.has(key));

  const priorities = rankPriorities(
    [
      ...(canViewTasks ? taskRows.map((item) => ({ ...item, source: "task" as const })) : []),
      ...(canViewCalendar
        ? viewingRows.map((item) => ({ ...item, source: "viewing" as const }))
        : []),
    ],
    now,
  );

  const currency = organizationRows[0]?.currency ?? "PHP";
  const overdueTasks = overdueTaskRows[0]?.value ?? 0;
  const wonCount = wonRows[0]?.count ?? 0;
  const wonValue = Number(wonRows[0]?.value ?? 0);
  const lostCount = lostRows[0]?.value ?? 0;
  const closedCount = wonCount + lostCount;
  const winRate = rate(wonCount, closedCount);
  const newLeads = newLeadRows[0]?.value ?? 0;

  // A reading another panel already shows is left out while that panel is on screen.
  const readings = [
    canViewTasks &&
      !sections.taskLoad && {
        key: "overdueTasks",
        label: "Overdue tasks",
        value: overdueTasks.toLocaleString(),
        hint: "Open and past due",
        tone: overdueTasks > 0 ? ("attention" as const) : undefined,
      },
    canViewCalendar &&
      !sections.viewings && {
        key: "viewings",
        label: "Viewings scheduled",
        value: (upcomingViewingRows[0]?.value ?? 0).toLocaleString(),
        hint: "Next 7 days",
      },
    canViewContacts && {
      key: "activeContacts",
      label: "Active contacts",
      value: (activeLeadRows[0]?.value ?? 0).toLocaleString(),
      hint: "Not yet converted",
    },
    canViewContacts && {
      key: "newLeads",
      label: "New contacts this month",
      value: newLeads.toLocaleString(),
      hint: `Created since ${format(parseISO(manilaDate(monthStart)), "MMM d")}`,
    },
    canViewDeals && {
      key: "closed",
      label: "Won this month",
      value: formatMoneyShort(wonValue, currency) ?? "",
      hint: `${wonCount} won · ${lostCount} lost`,
    },
    canViewDeals && {
      key: "winRate",
      label: "Win rate this month",
      value: winRate === null ? "—" : `${winRate}%`,
      hint:
        closedCount === 0
          ? "None closed yet"
          : `Of ${closedCount} closed ${closedCount === 1 ? "opportunity" : "opportunities"}`,
    },
    canViewProperties &&
      !sections.inventory && {
        key: "inventory",
        label: "Reserved properties",
        value: (reservedPropertyRows[0]?.value ?? 0).toLocaleString(),
        hint: "Reserved or under contract",
      },
  ].filter((reading): reading is DashboardReading => Boolean(reading));

  return {
    currency,
    kpis: {
      activeLeads: activeLeadRows[0]?.value ?? 0,
      leadChange: percentageChange(newLeadRows[0]?.value ?? 0, previousLeadRows[0]?.value ?? 0),
      activeProperties: propertyRows[0]?.value ?? 0,
      payments: collectedRows[0]?.count ?? 0,
      collected: Number(collectedRows[0]?.value ?? 0),
      reservationPayments: reservationRows[0]?.count ?? 0,
      reservationsReceived: Number(reservationRows[0]?.value ?? 0),
      availableUnits: unitAvailabilityRows[0]?.available ?? 0,
      totalUnits: unitAvailabilityRows[0]?.total ?? 0,
      availableParking: parkingAvailabilityRows[0]?.available ?? 0,
      totalParking: parkingAvailabilityRows[0]?.total ?? 0,
      floors: floorRows[0]?.floors ?? 0,
      floorProperties: floorRows[0]?.properties ?? 0,
      wonCount: wonTotalRows[0]?.count ?? 0,
      wonValue: Number(wonTotalRows[0]?.value ?? 0),
      // Billing data: never sent without the payment figures.
      wonCollected: sections.kpis.collected ? Number(wonCollectedRows[0]?.value ?? 0) : 0,
      monthlyPayments: monthlyPaidRows[0]?.count ?? 0,
      monthlyPaid: Number(monthlyPaidRows[0]?.value ?? 0),
    },
    revenueSeries: revenueSeries(closedSalesRows, forecastRows, now),
    pipelineStages: stageRows
      .filter((row) => row.value > 0)
      .map((row) => ({ name: row.name, value: row.value })),
    priorities,
    closingSoon: closingSoonRows.map((row) => ({
      id: row.id,
      title: row.title,
      amount: Number(row.amount ?? 0),
      expectedCloseDate: row.expectedCloseDate,
      probability: Number(row.probability ?? 0),
      stageName: row.stageName,
      agentName: [row.agentFirstName, row.agentLastName].filter(Boolean).join(" ") || null,
    })),
    taskLoad: {
      overdue: taskLoadRows[0]?.overdue ?? 0,
      dueToday: taskLoadRows[0]?.dueToday ?? 0,
      thisWeek: taskLoadRows[0]?.thisWeek ?? 0,
      unscheduled: taskLoadRows[0]?.unscheduled ?? 0,
      completedThisWeek: completedTaskRows[0]?.value ?? 0,
    },
    inventoryStatus: inventoryStatusRows.map((row) => ({
      status: row.status,
      value: Number(row.value),
    })),
    readings: sections.summary ? readings : [],
    activities: activityRows,
    sections,
    organizationWide,
    scope: resolveDataScope(context),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
