"use server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities, auditLogs, properties, tasks, users } from "@/db/schema";
import { InactiveAssigneeError, lockActiveAssignees } from "@/lib/permissions/active-assignees";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import { taskSchema, taskStatusSchema } from "../schemas/task.schema";
import { grantedPropertyCondition } from "@/lib/permissions/property-access";
import type { AuthorizationContext } from "@/lib/permissions/policy";
import { logError } from "@/lib/logger";
import {
  ActionResult,
  success,
  failureFrom,
  validationFailure,
  validationFailureFromZod,
  databaseFailure,
} from "@/lib/types/action-result";
import { ActionErrorCode } from "@/lib/errors";
import { fromManilaDateTimeLocal } from "@/lib/utils/manila-time";
import { canAssignTask, taskAssigneeError } from "../lib/task-assignee";

export type TaskResult = ActionResult<{ id: string }>;

async function validateRelations(
  context: AuthorizationContext,
  v: {
    contactId: string | null;
    propertyId: string | null;
    dealId: string | null;
  },
) {
  const org = context.organizationId;
  const checks = await Promise.all([
    // Scope-aware, so an agent cannot link a task to another agent's client.
    v.contactId
      ? canAccessResource(context, { type: "contact", id: v.contactId }).then((ok) =>
          ok ? [{ id: v.contactId }] : [],
        )
      : [{ id: "" }],
    v.propertyId
      ? db
          .select({ id: properties.id })
          .from(properties)
          .where(
            and(
              eq(properties.id, v.propertyId),
              eq(properties.organizationId, org),
              grantedPropertyCondition(context, { propertyId: properties.id }),
            ),
          )
          .limit(1)
      : [{ id: "" }],
    v.dealId
      ? canAccessResource(context, { type: "deal", id: v.dealId }).then((ok) =>
          ok ? [{ id: v.dealId }] : [],
        )
      : [{ id: "" }],
  ]);
  return checks.every((v) => v.length);
}
async function assigneeAllowed(context: AuthorizationContext, userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      brokerId: users.brokerId,
      status: users.status,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, context.organizationId)))
    .limit(1);
  return canAssignTask(context, user);
}
export async function createTask(input: unknown): Promise<TaskResult> {
  const context = await requirePermission("tasks.create");
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;
  if (v.assignedUserId && !(await assigneeAllowed(context, v.assignedUserId)))
    return validationFailure(taskAssigneeError);
  if (!(await validateRelations(context, v)))
    return failureFrom(ActionErrorCode.NOT_FOUND, "One or more related records are unavailable.");
  try {
    const id = await db.transaction(async (tx) => {
      await lockActiveAssignees(tx, context.organizationId, [v.assignedUserId || context.userId]);
      const [row] = await tx
        .insert(tasks)
        .values({
          organizationId: context.organizationId,
          title: v.title,
          description: v.description || null,
          taskType: v.taskType,
          priority: v.priority,
          assignedUserId: v.assignedUserId || context.userId,
          createdBy: context.userId,
          contactId: v.contactId,
          propertyId: v.propertyId,
          dealId: v.dealId,
          dueAt: v.dueAt ? fromManilaDateTimeLocal(v.dueAt) : null,
          reminderAt: v.reminderAt ? fromManilaDateTimeLocal(v.reminderAt) : null,
        })
        .returning({ id: tasks.id });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "task.created",
        summary: `Task created: ${v.title}.`,
        taskId: row.id,
        contactId: v.contactId,
        propertyId: v.propertyId,
        dealId: v.dealId,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "task",
        entityId: row.id,
        newValues: {
          title: v.title,
          type: v.taskType,
          priority: v.priority,
          assignedUserId: v.assignedUserId,
        },
      });
      return row.id;
    });
    revalidatePath("/tasks");
    revalidatePath("/tasks/my-tasks");
    revalidatePath("/dashboard");
    return success({ id });
  } catch (error) {
    if (error instanceof InactiveAssigneeError) return validationFailure(error.message);
    logError("Task creation failed", error, { operation: "task_create" });
    return databaseFailure("Couldn't save the task.");
  }
}
export async function changeTaskStatus(input: unknown): Promise<TaskResult> {
  const context = await requirePermission("tasks.update");
  const parsed = taskStatusSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  if (!(await canAccessResource(context, { type: "task", id: parsed.data.id })))
    return failureFrom(ActionErrorCode.NOT_FOUND, "Task not found.");
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          title: tasks.title,
          status: tasks.status,
          contactId: tasks.contactId,
          propertyId: tasks.propertyId,
          dealId: tasks.dealId,
        })
        .from(tasks)
        .where(and(eq(tasks.id, parsed.data.id), eq(tasks.organizationId, context.organizationId)))
        .limit(1);
      if (!before) throw new Error("Task not found");
      await tx
        .update(tasks)
        .set({
          status: parsed.data.status,
          completedAt: parsed.data.status === "completed" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, parsed.data.id));
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "task.status_changed",
        summary: `${before.title} marked ${parsed.data.status.replaceAll("_", " ")}.`,
        taskId: parsed.data.id,
        contactId: before.contactId,
        propertyId: before.propertyId,
        dealId: before.dealId,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "task",
        entityId: parsed.data.id,
        oldValues: { status: before.status },
        newValues: { status: parsed.data.status },
      });
    });
    revalidatePath("/tasks");
    revalidatePath("/tasks/my-tasks");
    revalidatePath("/dashboard");
    return success({ id: parsed.data.id });
  } catch (error) {
    logError("Task status failed", error, { operation: "task_status_update" });
    return databaseFailure("Couldn't update the task status.");
  }
}
export async function updateTask(id: string, input: unknown): Promise<TaskResult> {
  const context = await requirePermission("tasks.update");
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;
  if (!z.uuid().safeParse(id).success || !(await canAccessResource(context, { type: "task", id })))
    return failureFrom(ActionErrorCode.NOT_FOUND, "Task not found.");
  // Only a new assignee is checked, so tasks already assigned outside reach stay editable.
  const [current] = await db
    .select({ assignedUserId: tasks.assignedUserId })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.organizationId, context.organizationId)))
    .limit(1);
  if (
    v.assignedUserId &&
    v.assignedUserId !== current?.assignedUserId &&
    !(await assigneeAllowed(context, v.assignedUserId))
  )
    return validationFailure(taskAssigneeError);
  if (!(await validateRelations(context, v)))
    return failureFrom(ActionErrorCode.NOT_FOUND, "One or more related records are unavailable.");
  const values = {
    title: v.title,
    description: v.description || null,
    taskType: v.taskType,
    priority: v.priority,
    assignedUserId: v.assignedUserId || context.userId,
    contactId: v.contactId,
    propertyId: v.propertyId,
    dealId: v.dealId,
    // The form edits Manila wall-clock time.
    dueAt: v.dueAt ? fromManilaDateTimeLocal(v.dueAt) : null,
    reminderAt: v.reminderAt ? fromManilaDateTimeLocal(v.reminderAt) : null,
  };
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.organizationId, context.organizationId)))
        .limit(1);
      if (!before) throw new Error("Task not found");
      if (values.assignedUserId !== before.assignedUserId)
        await lockActiveAssignees(tx, context.organizationId, [values.assignedUserId]);
      await tx
        .update(tasks)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(tasks.id, id));
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "task.updated",
        summary: `Task updated: ${v.title}.`,
        taskId: id,
        contactId: v.contactId,
        propertyId: v.propertyId,
        dealId: v.dealId,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "task",
        entityId: id,
        oldValues: Object.fromEntries(
          Object.keys(values).map((key) => [key, before[key as keyof typeof values]]),
        ),
        newValues: values,
      });
    });
    refreshTasks();
    return success({ id });
  } catch (error) {
    if (error instanceof InactiveAssigneeError) return validationFailure(error.message);
    logError("Task update failed", error, { operation: "task_update" });
    return databaseFailure("Couldn't save the task.");
  }
}
export async function deleteTask(id: string): Promise<TaskResult> {
  const context = await requirePermission("tasks.delete");
  if (!z.uuid().safeParse(id).success || !(await canAccessResource(context, { type: "task", id })))
    return failureFrom(ActionErrorCode.NOT_FOUND, "Task not found.");
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(tasks)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(tasks.id, id),
            eq(tasks.organizationId, context.organizationId),
            isNull(tasks.deletedAt),
          ),
        )
        .returning({ title: tasks.title, contactId: tasks.contactId, dealId: tasks.dealId });
      if (!row) throw new Error("Task not found");
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "task.deleted",
        summary: `Task deleted: ${row.title}.`,
        taskId: id,
        contactId: row.contactId,
        dealId: row.dealId,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "task",
        entityId: id,
        oldValues: { title: row.title },
      });
    });
    refreshTasks();
    return success({ id });
  } catch (error) {
    logError("Task delete failed", error, { operation: "task_delete" });
    return databaseFailure("Couldn't delete the task.");
  }
}
function refreshTasks() {
  revalidatePath("/tasks");
  revalidatePath("/tasks/my-tasks");
  revalidatePath("/dashboard");
}
