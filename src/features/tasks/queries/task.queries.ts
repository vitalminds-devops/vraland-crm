import "server-only";
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { contacts, deals, properties, tasks, users } from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { dataScopeCondition, scopedAgentCondition } from "@/lib/permissions/scope";
import { taskDueToday, taskOverdue, taskUpcoming } from "../lib/task-predicates";

/** The columns the task table can be ordered by. */
const TASK_SORT_KEYS = ["task", "due", "priority", "assignee", "status"] as const;
export type TaskSortKey = (typeof TASK_SORT_KEYS)[number];

export function isTaskSortKey(value: string | undefined): value is TaskSortKey {
  return TASK_SORT_KEYS.includes(value as TaskSortKey);
}

const PRIORITY_RANK = sql`case ${tasks.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;
const STATUS_RANK = sql`case ${tasks.status} when 'todo' then 0 when 'in_progress' then 1 when 'completed' then 2 else 3 end`;
const OPEN_FIRST = sql`case when ${tasks.status} in ('completed','cancelled') then 1 else 0 end`;
const creator = alias(users, "task_creator");

export async function listTasks(input: {
  page: number;
  pageSize?: number;
  search?: string;
  status?: string;
  priority?: string;
  timing?: string;
  sort?: string;
  dir?: string;
  mine?: boolean;
}) {
  const context = await requirePermission("tasks.view");
  const limit = input.pageSize && input.pageSize > 0 ? input.pageSize : 20;
  const scope = input.mine
    ? eq(tasks.assignedUserId, context.userId)
    : dataScopeCondition(context, {
        organizationId: tasks.organizationId,
        ownerUserId: tasks.assignedUserId,
      });
  const timing =
    input.timing === "overdue"
      ? taskOverdue()
      : input.timing === "today"
        ? taskDueToday()
        : input.timing === "upcoming"
          ? taskUpcoming()
          : undefined;
  const where = and(
    eq(tasks.organizationId, context.organizationId),
    isNull(tasks.deletedAt),
    input.status ? eq(tasks.status, input.status) : undefined,
    input.priority ? eq(tasks.priority, input.priority) : undefined,
    input.search
      ? or(ilike(tasks.title, `%${input.search}%`), ilike(tasks.description, `%${input.search}%`))
      : undefined,
    timing,
    scope,
  );
  const orderFor: Record<TaskSortKey, SQL> = {
    task: sql`${tasks.title}`,
    due: sql`${tasks.dueAt}`,
    priority: PRIORITY_RANK,
    assignee: sql`${users.lastName}`,
    status: STATUS_RANK,
  };
  const sortKey = isTaskSortKey(input.sort) ? input.sort : undefined;
  const direction = input.dir === "asc" ? asc : desc;
  const orderBy = sortKey
    ? [direction(orderFor[sortKey]), asc(tasks.id)]
    : [OPEN_FIRST, asc(tasks.dueAt), PRIORITY_RANK, asc(tasks.id)];
  const [rows, total, summary] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        taskType: tasks.taskType,
        priority: tasks.priority,
        status: tasks.status,
        dueAt: tasks.dueAt,
        reminderAt: tasks.reminderAt,
        assignedUserId: tasks.assignedUserId,
        assignedFirstName: users.firstName,
        assignedLastName: users.lastName,
        creatorFirstName: creator.firstName,
        creatorLastName: creator.lastName,
        contactId: contacts.id,
        contactFirstName: contacts.firstName,
        contactMiddleName: contacts.middleName,
        contactLastName: contacts.lastName,
        propertyId: properties.id,
        propertyTitle: properties.title,
        dealId: deals.id,
        dealTitle: deals.title,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedUserId, users.id))
      .leftJoin(creator, eq(tasks.createdBy, creator.id))
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .leftJoin(properties, eq(tasks.propertyId, properties.id))
      .leftJoin(deals, eq(tasks.dealId, deals.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset((input.page - 1) * limit),
    db.select({ value: count() }).from(tasks).where(where),
    db
      .select({
        overdue: sql<number>`count(*) filter (where ${taskOverdue()})::int`,
        today: sql<number>`count(*) filter (where ${taskDueToday()})::int`,
        upcoming: sql<number>`count(*) filter (where ${taskUpcoming()})::int`,
      })
      .from(tasks)
      .where(and(eq(tasks.organizationId, context.organizationId), isNull(tasks.deletedAt), scope)),
  ]);
  return {
    rows,
    total: total[0]?.value ?? 0,
    pages: Math.max(1, Math.ceil((total[0]?.value ?? 0) / limit)),
    summary: summary[0] ?? { overdue: 0, today: 0, upcoming: 0 },
    canCreate: context.permissions.has("tasks.create"),
    canUpdate: context.permissions.has("tasks.update"),
    canDelete: context.permissions.has("tasks.delete"),
  };
}
export async function getTaskOptions() {
  const context = await requirePermission("tasks.view");
  const agents = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(
      and(
        eq(users.organizationId, context.organizationId),
        eq(users.status, "active"),
        isNull(users.deletedAt),
        scopedAgentCondition(context),
      ),
    )
    .orderBy(asc(users.lastName));
  return { agents };
}
