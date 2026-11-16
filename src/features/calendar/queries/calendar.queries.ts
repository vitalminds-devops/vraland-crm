import "server-only";
import { and, asc, eq, exists, gte, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  calendarEvents,
  calendarEventUsers,
  contacts,
  propertyViewings,
  properties,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { hasOrganizationWideAccess } from "@/lib/permissions/policy";
import { grantedPropertyCondition } from "@/lib/permissions/property-access";
import { dataScopeCondition, scopedAgentCondition } from "@/lib/permissions/scope";
export async function listCalendarEvents(input: { start: Date; end: Date; type?: string }) {
  const context = await requirePermission("calendar.view");
  const organizationWide = hasOrganizationWideAccess(context);
  const scope = organizationWide
    ? undefined
    : or(
        eq(calendarEvents.createdBy, context.userId),
        // exists, not a join: a join returned the event once per invitee.
        exists(
          db
            .select({ id: calendarEventUsers.eventId })
            .from(calendarEventUsers)
            .where(
              and(
                eq(calendarEventUsers.eventId, calendarEvents.id),
                eq(calendarEventUsers.userId, context.userId),
              ),
            ),
        ),
      );
  const owner = alias(users, "calendar_owner");
  const rows = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      description: calendarEvents.description,
      eventType: calendarEvents.eventType,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      allDay: calendarEvents.allDay,
      location: calendarEvents.location,
      contactId: calendarEvents.contactId,
      propertyId: calendarEvents.propertyId,
      dealId: calendarEvents.dealId,
      viewingId: propertyViewings.id,
      viewingStatus: propertyViewings.status,
      viewingAgentUserId: propertyViewings.agentUserId,
      propertyTitle: properties.title,
      contactFirstName: contacts.firstName,
      contactMiddleName: contacts.middleName,
      contactLastName: contacts.lastName,
      agentFirstName: users.firstName,
      agentLastName: users.lastName,
      ownerId: calendarEvents.createdBy,
      ownerFirstName: owner.firstName,
      ownerLastName: owner.lastName,
    })
    .from(calendarEvents)
    .leftJoin(propertyViewings, eq(propertyViewings.eventId, calendarEvents.id))
    .leftJoin(
      properties,
      and(
        eq(calendarEvents.propertyId, properties.id),
        eq(properties.organizationId, context.organizationId),
      ),
    )
    .leftJoin(
      contacts,
      and(
        eq(calendarEvents.contactId, contacts.id),
        eq(contacts.organizationId, context.organizationId),
      ),
    )
    .leftJoin(
      users,
      and(
        eq(propertyViewings.agentUserId, users.id),
        eq(users.organizationId, context.organizationId),
      ),
    )
    .leftJoin(
      owner,
      and(eq(calendarEvents.createdBy, owner.id), eq(owner.organizationId, context.organizationId)),
    )
    .where(
      and(
        eq(calendarEvents.organizationId, context.organizationId),
        gte(calendarEvents.endAt, input.start),
        lt(calendarEvents.startAt, input.end),
        input.type ? eq(calendarEvents.eventType, input.type) : undefined,
        scope,
      ),
    )
    .orderBy(asc(calendarEvents.startAt));
  return {
    rows,
    // The same permission the create actions require.
    canCreate: context.permissions.has("calendar.manage"),
    canUpdate: context.permissions.has("tasks.update"),
  };
}
export async function listViewings(input: {
  status?: string;
  from?: Date;
  to?: Date;
  /** Only the last 30 days and upcoming. */
  recent?: boolean;
}) {
  const context = await requirePermission("calendar.view");
  const scope = hasOrganizationWideAccess(context)
    ? undefined
    : and(
        eq(propertyViewings.agentUserId, context.userId),
        dataScopeCondition(context, {
          organizationId: calendarEvents.organizationId,
          ownerUserId: propertyViewings.agentUserId,
        }),
      );
  return (
    db
      .select({
        id: propertyViewings.id,
        eventId: calendarEvents.id,
        title: calendarEvents.title,
        startAt: calendarEvents.startAt,
        endAt: calendarEvents.endAt,
        location: calendarEvents.location,
        status: propertyViewings.status,
        feedback: propertyViewings.feedback,
        interestLevel: propertyViewings.interestLevel,
        propertyId: properties.id,
        propertyTitle: properties.title,
        propertyCode: properties.propertyCode,
        contactId: contacts.id,
        contactFirstName: contacts.firstName,
        contactMiddleName: contacts.middleName,
        contactLastName: contacts.lastName,
        agentFirstName: users.firstName,
        agentLastName: users.lastName,
        agentUserId: propertyViewings.agentUserId,
        createdBy: calendarEvents.createdBy,
        dealId: calendarEvents.dealId,
      })
      .from(propertyViewings)
      .innerJoin(
        calendarEvents,
        and(
          eq(propertyViewings.eventId, calendarEvents.id),
          eq(calendarEvents.organizationId, context.organizationId),
        ),
      )
      .innerJoin(properties, eq(propertyViewings.propertyId, properties.id))
      .innerJoin(contacts, eq(propertyViewings.contactId, contacts.id))
      .leftJoin(users, eq(propertyViewings.agentUserId, users.id))
      .where(
        and(
          input.status ? eq(propertyViewings.status, input.status) : undefined,
          input.from ? gte(calendarEvents.startAt, input.from) : undefined,
          input.to ? lt(calendarEvents.startAt, input.to) : undefined,
          input.recent ? sql`${calendarEvents.startAt} >= now() - interval '30 days'` : undefined,
          scope,
        ),
      )
      .orderBy(asc(calendarEvents.startAt))
      // shortcut: a hard cap instead of paging; add a paginator if one window ever holds more.
      .limit(500)
  );
}
export async function getCalendarOptions() {
  const context = await requirePermission("calendar.view");
  const agentScope = scopedAgentCondition(context);

  const [agents, contactRows, propertyRows] = await Promise.all([
    db
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
          agentScope,
        ),
      )
      .orderBy(asc(users.lastName)),
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, context.organizationId),
          isNull(contacts.deletedAt),
          dataScopeCondition(context, {
            organizationId: contacts.organizationId,
            ownerUserId: contacts.assignedUserId,
            brokerUserId: contacts.brokerUserId,
          }),
        ),
      )
      .orderBy(asc(contacts.lastName))
      .limit(500),
    db
      .select({
        id: properties.id,
        title: properties.title,
        addressLine1: properties.addressLine1,
        city: properties.city,
      })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          grantedPropertyCondition(context, { propertyId: properties.id }),
          dataScopeCondition(context, {
            organizationId: properties.organizationId,
          }),
        ),
      )
      .orderBy(asc(properties.title))
      .limit(500),
  ]);
  return { agents, contacts: contactRows, properties: propertyRows };
}
