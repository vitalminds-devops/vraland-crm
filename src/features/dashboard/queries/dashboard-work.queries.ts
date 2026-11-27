import "server-only";

import { and, asc, count, desc, eq, gte, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { activities, calendarEvents, propertyViewings, tasks, users } from "@/db/schema";
import { taskDueToday, taskOverdue } from "@/features/tasks/lib/task-predicates";

import type { DashboardScope } from "./dashboard-scope.queries";

/** Tasks, viewings and recent activity. */
export async function workRows({
  context,
  now,
  todayStart,
  priorityWindowEnd,
  tomorrowStart,
  weekStart,
  organizationWide,
  taskScope,
  activityModules,
  activityScope,
}: DashboardScope) {
  const [
    taskRows,
    viewingRows,
    activityRows,
    overdueTaskRows,
    upcomingViewingRows,
    taskLoadRows,
    completedTaskRows,
  ] = await Promise.all([
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
  ]);
  return {
    taskRows,
    viewingRows,
    activityRows,
    overdueTaskRows,
    upcomingViewingRows,
    taskLoadRows,
    completedTaskRows,
  };
}
