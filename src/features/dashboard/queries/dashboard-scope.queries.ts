import "server-only";

import { addDays } from "date-fns";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { visibleActivityPrefixes } from "../lib/activity-modules";
import { activeLead } from "@/features/contacts/lib/contact-stage-sql";
import { activities, contacts, deals, properties, tasks } from "@/db/schema";
import { grantedPropertyCondition } from "@/lib/permissions/property-access";
import { hasOrganizationWideAccess, type AuthorizationContext } from "@/lib/permissions/policy";
import {
  dataScopeCondition,
  contactScopeCondition,
  dealScopeCondition,
} from "@/lib/permissions/scope";
import {
  manilaDate,
  startOfManilaDay,
  startOfManilaMonth,
  startOfManilaWeek,
} from "@/lib/utils/manila-time";
import { leadNotArchived } from "@/features/deals/lib/lead-not-archived";

/** Dates, permissions and the visibility conditions every dashboard section reads. */
export function dashboardScope(context: AuthorizationContext) {
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

  return {
    context,
    now,
    monthStart,
    nextMonthStart,
    previousMonthStart,
    todayStart,
    priorityWindowEnd,
    closingWindowEnd,
    tomorrowStart,
    weekStart,
    monthEndDate,
    organizationWide,
    canViewDeals,
    canViewContacts,
    canViewProperties,
    canViewTasks,
    canViewCalendar,
    contactScope,
    propertyScope,
    dealAccess,
    dealScope,
    taskScope,
    newContactCondition,
    activeLeadCondition,
    monthExpression,
    forecastMonthExpression,
    visibleContactIds,
    visiblePropertyIds,
    visibleDealIds,
    visibleTaskIds,
    activityPrefixes,
    activityModules,
    activityScope,
  };
}

export type DashboardScope = ReturnType<typeof dashboardScope>;
