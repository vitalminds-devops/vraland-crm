import {
  boolean,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { contacts } from "./contacts";
import { deals } from "./deals";
import { organizations, users } from "./organization";
import { properties } from "./properties";
import { createdAt, updatedAt } from "./shared";

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: varchar({ length: 220 }).notNull(),
    description: text(),
    eventType: varchar("event_type", { length: 30 }).default("general").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").default(false).notNull(),
    location: text(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    externalCalendarProvider: varchar("external_calendar_provider", {
      length: 30,
    }),
    externalEventId: varchar("external_event_id", { length: 255 }),
    createdAt,
    updatedAt,
  },
  (t) => [index("calendar_events_org_start_idx").on(t.organizationId, t.startAt)],
);

export const calendarEventUsers = pgTable(
  "calendar_event_users",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** needs_action until the person assigned accepts or declines. */
    attendeeStatus: varchar("attendee_status", { length: 20 }).default("accepted").notNull(),
    /** Why they declined. */
    responseNote: text("response_note"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

export const calendarEventContacts = pgTable(
  "calendar_event_contacts",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    attendeeStatus: varchar("attendee_status", { length: 20 }).default("needs_action").notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.contactId] })],
);

export const propertyViewings = pgTable("property_viewings", {
  id: uuid().defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .unique()
    .references(() => calendarEvents.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  agentUserId: uuid("agent_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  status: varchar({ length: 20 }).default("scheduled").notNull(),
  feedback: text(),
  interestLevel: smallint("interest_level"),
  createdAt,
  updatedAt,
});
