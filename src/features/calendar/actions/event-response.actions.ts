"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities, auditLogs, calendarEvents, calendarEventUsers } from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { logError } from "@/lib/logger";
import {
  databaseFailure,
  notFoundFailure,
  success,
  validationFailureFromZod,
  type ActionResult,
} from "@/lib/types/action-result";
import { eventResponseSchema } from "../schemas/calendar.schema";

/** The person an event is assigned to accepts or declines it; a decline keeps their reason. */
export async function respondToCalendarEvent(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const context = await requirePermission("calendar.view");
  const parsed = eventResponseSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const v = parsed.data;
  const note = v.response === "declined" ? (v.note ?? null) : null;
  try {
    const saved = await db.transaction(async (tx) => {
      // Only the person assigned can answer, and only for an event in their organization.
      const [row] = await tx
        .select({
          title: calendarEvents.title,
          contactId: calendarEvents.contactId,
          propertyId: calendarEvents.propertyId,
          dealId: calendarEvents.dealId,
          status: calendarEventUsers.attendeeStatus,
          note: calendarEventUsers.responseNote,
        })
        .from(calendarEventUsers)
        .innerJoin(calendarEvents, eq(calendarEvents.id, calendarEventUsers.eventId))
        .where(
          and(
            eq(calendarEventUsers.eventId, v.eventId),
            eq(calendarEventUsers.userId, context.userId),
            eq(calendarEvents.organizationId, context.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!row) return false;
      await tx
        .update(calendarEventUsers)
        .set({ attendeeStatus: v.response, responseNote: note, respondedAt: new Date() })
        .where(
          and(
            eq(calendarEventUsers.eventId, v.eventId),
            eq(calendarEventUsers.userId, context.userId),
          ),
        );
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: v.response === "accepted" ? "calendar.accepted" : "calendar.declined",
        summary:
          v.response === "accepted"
            ? `${row.title} was accepted.`
            : `${row.title} was declined: ${note}`,
        contactId: row.contactId,
        propertyId: row.propertyId,
        dealId: row.dealId,
        metadata: { eventId: v.eventId },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "calendar_event",
        entityId: v.eventId,
        oldValues: { response: row.status, note: row.note },
        newValues: { response: v.response, note },
      });
      return true;
    });
    if (!saved) return notFoundFailure("Event");
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return success({ id: v.eventId });
  } catch (error) {
    logError("Event response failed", error, { operation: "event_respond" });
    return databaseFailure("Your answer could not be saved.");
  }
}
