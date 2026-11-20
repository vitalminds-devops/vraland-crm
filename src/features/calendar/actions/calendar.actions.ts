"use server";
import { and, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  calendarEvents,
  calendarEventContacts,
  calendarEventUsers,
  propertyViewings,
  users,
} from "@/db/schema";
import { dealAgents as dealAgentsTable } from "@/db/schema/deals";
import { InactiveAssigneeError, lockActiveAssignees } from "@/lib/permissions/active-assignees";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import { canEditViewing, type ViewingReference } from "@/lib/permissions/viewings";
import {
  eventSchema,
  eventUpdateSchema,
  viewingSchema,
  viewingStatusSchema,
} from "../schemas/calendar.schema";
import { occurrences } from "../lib/recurrence";
import { assignmentStatus, canChangeEvent } from "../lib/event-access";
import { activeUserIds } from "../queries/invitees.queries";
import { enrollByTrigger } from "@/features/marketing/lib/auto-enroll";
import { z } from "zod";
import { logError } from "@/lib/logger";
import {
  ActionResult,
  databaseFailure,
  failure,
  failureFrom,
  notFoundFailure,
  success,
  validationFailure,
  validationFailureFromZod,
} from "@/lib/types/action-result";
import { ActionErrorCode, conflict, outOfScope, permissionDenied } from "@/lib/errors";
import { fromManilaDateTimeLocal } from "@/lib/utils/manila-time";

export type CalendarResult = ActionResult<{ id: string }>;
const refresh = () => {
  revalidatePath("/calendar");
  revalidatePath("/calendar/viewings");
  revalidatePath("/calendar/follow-ups");
  revalidatePath("/calendar/closings");
  revalidatePath("/dashboard");
};
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Viewings that still hold the agent's time. */
const ACTIVE_VIEWING = ["scheduled", "confirmed"];
/** Viewings with an outcome on record; deleting them would lose it. */
const FINISHED_VIEWING = ["completed", "no_show"];
type Context = Awaited<ReturnType<typeof requirePermission>>;

/**
 * True when the agent already has a scheduled viewing overlapping this time. Takes a per-agent lock
 * first, so two bookings cannot both pass the check.
 */
async function viewingClash(
  tx: Tx,
  agentUserId: string,
  startAt: Date,
  endAt: Date,
  exceptEventId?: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`viewing:${agentUserId}`}))`);
  const [clash] = await tx
    .select({ id: propertyViewings.id })
    .from(propertyViewings)
    .innerJoin(calendarEvents, eq(propertyViewings.eventId, calendarEvents.id))
    .where(
      and(
        eq(propertyViewings.agentUserId, agentUserId),
        inArray(propertyViewings.status, ACTIVE_VIEWING),
        lt(calendarEvents.startAt, endAt),
        gt(calendarEvents.endAt, startAt),
        exceptEventId ? ne(calendarEvents.id, exceptEventId) : undefined,
      ),
    )
    .limit(1);
  return Boolean(clash);
}

/**
 * The event, when this user may change it: its creator, or someone allowed to change others'
 * events. Being assigned to it is not enough; they accept or decline it instead. A viewing
 * follows the viewing rules (its agent, creator or deal participants).
 */
async function editableEvent(
  context: Context,
  id: string,
  viewingPermission: "calendar.update_viewings" | "calendar.delete_viewings",
) {
  const [row] = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      createdBy: calendarEvents.createdBy,
      contactId: calendarEvents.contactId,
      propertyId: calendarEvents.propertyId,
      dealId: calendarEvents.dealId,
      organizationId: calendarEvents.organizationId,
      viewingId: propertyViewings.id,
      viewingAgentId: propertyViewings.agentUserId,
      viewingContactId: propertyViewings.contactId,
      viewingPropertyId: propertyViewings.propertyId,
      viewingStatus: propertyViewings.status,
    })
    .from(calendarEvents)
    .leftJoin(propertyViewings, eq(propertyViewings.eventId, calendarEvents.id))
    .where(
      and(eq(calendarEvents.id, id), eq(calendarEvents.organizationId, context.organizationId)),
    )
    .limit(1);
  if (!row) return "missing" as const;
  if (row.viewingId) {
    const participants = row.dealId
      ? (
          await db
            .select({ userId: dealAgentsTable.userId })
            .from(dealAgentsTable)
            .where(eq(dealAgentsTable.dealId, row.dealId))
        ).map((d) => d.userId)
      : [];
    const allowed = canEditViewing(
      context,
      {
        id: row.viewingId,
        organizationId: row.organizationId,
        agentUserId: row.viewingAgentId,
        eventCreatedBy: row.createdBy,
        contactId: row.viewingContactId!,
        propertyId: row.viewingPropertyId!,
        dealId: row.dealId,
      },
      participants,
      viewingPermission,
    );
    return allowed ? row : ("denied" as const);
  }
  return canChangeEvent(context, row.createdBy) ? row : ("denied" as const);
}

const cannotChange = () =>
  failure(permissionDenied("You can only change your own events and viewings."));

/**
 * Who an event is for: everyone, the chosen people, or only you when nobody is chosen.
 * Inviting anyone else needs Invite others to events; everyone needs Invite everyone to events.
 */
async function inviteList(
  context: Context,
  ids: string[],
  everyone: boolean,
  nobodyChosen = context.userId,
) {
  if (everyone) {
    if (!context.permissions.has("calendar.broadcast"))
      return failure(permissionDenied("You can't invite everyone to events."));
    return activeUserIds(context.organizationId);
  }
  if (!ids.length) return [nobodyChosen];
  if (ids.some((id) => id !== context.userId) && !context.permissions.has("calendar.assign"))
    return failure(permissionDenied("You can only add events to your own calendar."));
  const active = await activeUserIds(context.organizationId, ids);
  if (active.length !== ids.length)
    return failureFrom(ActionErrorCode.NOT_FOUND, "Someone you invited is no longer active.");
  return active;
}

export async function createCalendarEvent(input: unknown): Promise<CalendarResult> {
  const context = await requirePermission("calendar.manage");
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;
  const [contactAccessible, propertyAccessible, dealAccessible] = await Promise.all([
    v.contactId ? canAccessResource(context, { type: "contact", id: v.contactId }) : true,
    v.propertyId ? canAccessResource(context, { type: "property", id: v.propertyId }) : true,
    v.dealId ? canAccessResource(context, { type: "deal", id: v.dealId }) : true,
  ]);
  if (!contactAccessible || !propertyAccessible || !dealAccessible)
    return failure(outOfScope("The selected contact, property or deal is not accessible to you."));
  const invited = await inviteList(context, v.inviteeUserIds, v.inviteEveryone);
  if (!Array.isArray(invited)) return invited;
  // A repeating event is saved as one event per occurrence, each editable on its own.
  const series = occurrences(
    fromManilaDateTimeLocal(v.startAt),
    fromManilaDateTimeLocal(v.endAt),
    v.repeat,
    v.repeatCount,
  );
  const contactId = v.contactId;
  try {
    const id = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(calendarEvents)
        .values(
          series.map((occurrence) => ({
            organizationId: context.organizationId,
            title: v.title,
            description: v.description || null,
            eventType: v.eventType,
            startAt: occurrence.startAt,
            endAt: occurrence.endAt,
            allDay: v.allDay,
            location: v.location || null,
            createdBy: context.userId,
            contactId,
            propertyId: v.propertyId,
            dealId: v.dealId,
          })),
        )
        .returning({ id: calendarEvents.id });
      const row = rows[0];
      await tx.insert(calendarEventUsers).values(
        rows.flatMap((event) =>
          invited.map((userId) => ({
            eventId: event.id,
            userId,
            attendeeStatus: assignmentStatus(userId, context.userId),
          })),
        ),
      );
      if (contactId)
        await tx.insert(calendarEventContacts).values(
          rows.map((event) => ({
            eventId: event.id,
            contactId,
            attendeeStatus: "needs_action",
          })),
        );
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "calendar.created",
        summary:
          rows.length > 1
            ? `${v.title} was scheduled ${rows.length} times.`
            : `${v.title} was scheduled.`,
        contactId,
        propertyId: v.propertyId,
        dealId: v.dealId,
        metadata: { eventId: row.id, startAt: v.startAt, occurrences: rows.length },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "calendar_event",
        entityId: row.id,
        newValues: {
          title: v.title,
          eventType: v.eventType,
          startAt: v.startAt,
          repeat: v.repeat,
          occurrences: rows.length,
        },
      });
      return row.id;
    });
    refresh();
    return success({ id });
  } catch (error) {
    logError("Event creation failed", error, { operation: "event_create" });
    return databaseFailure("The calendar event could not be saved.");
  }
}
export async function createViewing(input: unknown): Promise<CalendarResult> {
  const context = await requirePermission("calendar.schedule_viewings");
  const parsed = viewingSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;

  // Validate that contact and property are within user's data scope
  const [contactAccessible, propertyAccessible] = await Promise.all([
    canAccessResource(context, { type: "contact", id: v.contactId }),
    canAccessResource(context, { type: "property", id: v.propertyId }),
  ]);

  if (!contactAccessible || !propertyAccessible) {
    return failure(outOfScope("The selected client or property is not accessible to you."));
  }

  // For non-organization-wide users (brokers), force agentUserId to themselves
  const agentUserId = context.permissions.has("calendar.assign_viewings")
    ? v.agentUserId
    : context.userId;

  // If agentUserId is specified (for managers/admins), validate the agent exists
  if (agentUserId && agentUserId !== context.userId) {
    const [agent] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, agentUserId),
          eq(users.organizationId, context.organizationId),
          eq(users.status, "active"),
        ),
      )
      .limit(1);
    if (!agent) return failureFrom(ActionErrorCode.NOT_FOUND, "The selected agent is unavailable.");
  }

  const viewingAgentId = agentUserId || context.userId;
  const startAt = fromManilaDateTimeLocal(v.startAt);
  const endAt = fromManilaDateTimeLocal(v.endAt);
  try {
    const id = await db.transaction(async (tx) => {
      await lockActiveAssignees(tx, context.organizationId, [viewingAgentId]);
      if (await viewingClash(tx, viewingAgentId, startAt, endAt)) return null;
      const [event] = await tx
        .insert(calendarEvents)
        .values({
          organizationId: context.organizationId,
          title: v.title,
          description: v.notes || null,
          eventType: "viewing",
          startAt,
          endAt,
          location: v.location || null,
          createdBy: context.userId,
          contactId: v.contactId,
          propertyId: v.propertyId,
        })
        .returning({ id: calendarEvents.id });

      await tx.insert(calendarEventUsers).values({
        eventId: event.id,
        userId: agentUserId || context.userId,
        attendeeStatus: "accepted",
      });

      await tx.insert(calendarEventContacts).values({
        eventId: event.id,
        contactId: v.contactId,
        attendeeStatus: "needs_action",
      });

      const [viewing] = await tx
        .insert(propertyViewings)
        .values({
          eventId: event.id,
          propertyId: v.propertyId,
          contactId: v.contactId,
          agentUserId: agentUserId || context.userId,
          status: "scheduled",
        })
        .returning({ id: propertyViewings.id });

      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "viewing.scheduled",
        summary: `Property viewing scheduled: ${v.title}.`,
        contactId: v.contactId,
        propertyId: v.propertyId,
        metadata: {
          eventId: event.id,
          viewingId: viewing.id,
          startAt: v.startAt,
        },
      });

      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "property_viewing",
        entityId: viewing.id,
        newValues: {
          eventId: event.id,
          propertyId: v.propertyId,
          contactId: v.contactId,
          agentUserId: agentUserId || context.userId,
          title: v.title,
          startAt: v.startAt,
          endAt: v.endAt,
        },
      });

      return viewing.id;
    });
    if (!id) return failure(conflict("The agent already has a viewing at that time."));
    refresh();
    return success({ id });
  } catch (error) {
    if (error instanceof InactiveAssigneeError) return validationFailure(error.message);
    logError("Viewing creation failed", error, { operation: "viewing_create" });
    return databaseFailure("The viewing could not be scheduled.");
  }
}
export async function updateViewingStatus(input: unknown): Promise<CalendarResult> {
  const context = await requirePermission("calendar.update_viewings");
  const parsed = viewingStatusSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;

  const [before] = await db
    .select({
      id: propertyViewings.id,
      status: propertyViewings.status,
      eventId: propertyViewings.eventId,
      agentId: propertyViewings.agentUserId,
      propertyId: propertyViewings.propertyId,
      contactId: propertyViewings.contactId,
      dealId: calendarEvents.dealId,
      title: calendarEvents.title,
      organizationId: calendarEvents.organizationId,
      createdBy: calendarEvents.createdBy,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
    })
    .from(propertyViewings)
    .innerJoin(
      calendarEvents,
      and(
        eq(propertyViewings.eventId, calendarEvents.id),
        eq(calendarEvents.organizationId, context.organizationId),
      ),
    )
    .where(eq(propertyViewings.id, v.id))
    .limit(1);

  if (!before) return notFoundFailure("Viewing");

  // Check if user is a participant on the related deal
  let dealParticipants: string[] = [];
  if (before.dealId) {
    const dealAgentRows = await db
      .select({ userId: dealAgentsTable.userId })
      .from(dealAgentsTable)
      .where(eq(dealAgentsTable.dealId, before.dealId));
    dealParticipants = dealAgentRows.map((d) => d.userId);
  }

  // Check edit permission using the helper
  const viewingRef: ViewingReference = {
    id: before.id,
    organizationId: before.organizationId,
    agentUserId: before.agentId,
    eventCreatedBy: before.createdBy,
    contactId: before.contactId,
    propertyId: before.propertyId,
    dealId: before.dealId,
  };

  if (!canEditViewing(context, viewingRef, dealParticipants)) {
    return failure(permissionDenied("You don't have permission to change this viewing."));
  }

  // Back on the schedule: its slot may have been given to another viewing meanwhile.
  const reactivated = ACTIVE_VIEWING.includes(v.status) && !ACTIVE_VIEWING.includes(before.status);
  try {
    const saved = await db.transaction(async (tx) => {
      if (
        reactivated &&
        before.agentId &&
        (await viewingClash(tx, before.agentId, before.startAt, before.endAt, before.eventId))
      )
        return false;
      await tx
        .update(propertyViewings)
        .set({
          status: v.status,
          feedback: v.feedback || null,
          interestLevel: v.interestLevel,
          updatedAt: new Date(),
        })
        .where(eq(propertyViewings.id, v.id));
      if (v.status === "completed" && before.status !== "completed")
        await enrollByTrigger(tx, {
          organizationId: context.organizationId,
          trigger: "viewing_completed",
          contactId: before.contactId,
          dealId: before.dealId,
        });

      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "viewing.status_changed",
        summary: `${before.title} marked ${v.status.replaceAll("_", " ")}.`,
        propertyId: before.propertyId,
        contactId: before.contactId,
        metadata: {
          viewingId: v.id,
          feedback: v.feedback,
          interestLevel: v.interestLevel,
        },
      });

      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "property_viewing",
        entityId: v.id,
        oldValues: { status: before.status },
        newValues: {
          status: v.status,
          feedback: v.feedback,
          interestLevel: v.interestLevel,
        },
      });
      return true;
    });
    if (!saved) return failure(conflict("The agent already has a viewing at that time."));
    refresh();
    return success({ id: v.id });
  } catch (error) {
    logError("Viewing update failed", error, { operation: "viewing_update" });
    return databaseFailure("The viewing could not be updated.");
  }
}

/** Edits one event; moving a viewing's times reschedules it. */
export async function updateCalendarEvent(input: unknown): Promise<CalendarResult> {
  const context = await requirePermission("calendar.view");
  const parsed = eventUpdateSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;
  const before = await editableEvent(context, v.id, "calendar.update_viewings");
  if (before === "missing") return notFoundFailure("Event");
  if (before === "denied") return cannotChange();
  const startAt = fromManilaDateTimeLocal(v.startAt);
  const endAt = fromManilaDateTimeLocal(v.endAt);
  if (before.viewingId && endAt <= startAt)
    return validationFailure("End time must be after the start time.");
  const moved =
    startAt.getTime() !== before.startAt.getTime() || endAt.getTime() !== before.endAt.getTime();

  // Who is invited changes only when the editor could choose; people kept keep their answers.
  let invites: { add: string[]; remove: string[]; all: string[] } | null = null;
  if (!before.viewingId && (v.inviteeUserIds !== undefined || v.inviteEveryone)) {
    const wanted = await inviteList(
      context,
      v.inviteeUserIds ?? [],
      Boolean(v.inviteEveryone),
      before.createdBy ?? context.userId,
    );
    if (!Array.isArray(wanted)) return wanted;
    const current = (
      await db
        .select({ userId: calendarEventUsers.userId })
        .from(calendarEventUsers)
        .where(eq(calendarEventUsers.eventId, v.id))
    ).map((row) => row.userId);
    const add = wanted.filter((id) => !current.includes(id));
    const remove = current.filter((id) => !wanted.includes(id));
    if (add.length || remove.length) invites = { add, remove, all: wanted };
  }

  try {
    const saved = await db.transaction(async (tx) => {
      if (
        before.viewingId &&
        before.viewingAgentId &&
        moved &&
        (await viewingClash(tx, before.viewingAgentId, startAt, endAt, v.id))
      )
        return false;
      await tx
        .update(calendarEvents)
        .set({
          title: v.title,
          description: v.description || null,
          ...(before.viewingId || !v.eventType ? {} : { eventType: v.eventType }),
          startAt,
          endAt,
          allDay: v.allDay,
          location: v.location || null,
          updatedAt: new Date(),
        })
        .where(eq(calendarEvents.id, v.id));
      // Newly invited people accept or decline, as on creation; removed people lose it.
      if (invites?.remove.length)
        await tx
          .delete(calendarEventUsers)
          .where(
            and(
              eq(calendarEventUsers.eventId, v.id),
              inArray(calendarEventUsers.userId, invites.remove),
            ),
          );
      if (invites?.add.length)
        await tx.insert(calendarEventUsers).values(
          invites.add.map((userId) => ({
            eventId: v.id,
            userId,
            attendeeStatus: assignmentStatus(userId, before.createdBy),
          })),
        );
      // A new time is a new request: everyone invited answers again.
      if (!before.viewingId && moved)
        await tx
          .update(calendarEventUsers)
          .set({ attendeeStatus: "needs_action", responseNote: null, respondedAt: null })
          .where(
            and(
              eq(calendarEventUsers.eventId, v.id),
              before.createdBy ? ne(calendarEventUsers.userId, before.createdBy) : undefined,
            ),
          );
      // A viewing marked rescheduled is back on the schedule once it has its new time.
      if (before.viewingId && moved && before.viewingStatus === "rescheduled")
        await tx
          .update(propertyViewings)
          .set({ status: "scheduled", updatedAt: new Date() })
          .where(eq(propertyViewings.id, before.viewingId));
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: before.viewingId && moved ? "viewing.rescheduled" : "calendar.updated",
        summary: moved ? `${v.title} was moved.` : `${v.title} was updated.`,
        contactId: before.contactId,
        propertyId: before.propertyId,
        dealId: before.dealId,
        metadata: { eventId: v.id, startAt: v.startAt },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "calendar_event",
        entityId: v.id,
        oldValues: {
          title: before.title,
          startAt: before.startAt.toISOString(),
          endAt: before.endAt.toISOString(),
        },
        newValues: {
          title: v.title,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          ...(invites ? { invited: invites.all } : {}),
        },
      });
      return true;
    });
    if (!saved) return failure(conflict("The agent already has a viewing at that time."));
    refresh();
    return success({ id: v.id });
  } catch (error) {
    logError("Event update failed", error, { operation: "event_update" });
    return databaseFailure("The calendar event could not be saved.");
  }
}

/** Removes one event, and its viewing when it is one; the audit log keeps what it was. */
export async function deleteCalendarEvent(id: string): Promise<CalendarResult> {
  const context = await requirePermission("calendar.view");
  if (!z.uuid().safeParse(id).success) return notFoundFailure("Event");
  const before = await editableEvent(context, id, "calendar.delete_viewings");
  if (before === "missing") return notFoundFailure("Event");
  if (before === "denied") return cannotChange();
  if (before.viewingStatus && FINISHED_VIEWING.includes(before.viewingStatus))
    return failure(conflict("This viewing has an outcome on record and can't be deleted."));
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(calendarEvents)
        .where(
          and(eq(calendarEvents.id, id), eq(calendarEvents.organizationId, context.organizationId)),
        );
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "calendar.deleted",
        summary: `${before.title} was deleted from the calendar.`,
        contactId: before.contactId,
        propertyId: before.propertyId,
        dealId: before.dealId,
        metadata: { eventId: id, viewingId: before.viewingId },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "calendar_event",
        entityId: id,
        oldValues: {
          title: before.title,
          startAt: before.startAt.toISOString(),
          endAt: before.endAt.toISOString(),
          viewingId: before.viewingId,
          viewingStatus: before.viewingStatus,
        },
      });
    });
    refresh();
    return success({ id });
  } catch (error) {
    logError("Event delete failed", error, { operation: "event_delete" });
    return databaseFailure("The calendar event could not be deleted.");
  }
}
