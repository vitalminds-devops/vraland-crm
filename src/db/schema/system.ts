import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { deals } from "./deals";
import { organizations, users } from "./organization";
import { properties } from "./properties";
import { createdAt, inet } from "./shared";
import { tasks } from "./tasks";

export const activities = pgTable(
  "activities",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    activityType: varchar("activity_type", { length: 80 }).notNull(),
    summary: text().notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "cascade",
    }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    documentId: uuid("document_id"),
    metadata: jsonb().default({}).notNull(),
    createdAt,
  },
  (t) => [
    index("activities_contact_id_idx").on(t.contactId),
    index("activities_deal_id_idx").on(t.dealId),
    index("activities_org_created_at_idx").on(t.organizationId, t.createdAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: integer().generatedAlwaysAsIdentity().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar({ length: 30 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: uuid("entity_id"),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_logs_org_occurred_at_idx").on(t.organizationId, t.occurredAt)],
);

export const dataJobs = pgTable("data_jobs", {
  id: uuid().defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  jobType: varchar("job_type", { length: 10 }).notNull(),
  entityType: varchar("entity_type", { length: 30 }).notNull(),
  status: varchar({ length: 20 }).default("queued").notNull(),
  storageKey: text("storage_key"),
  rowCount: integer("row_count"),
  successCount: integer("success_count"),
  failureCount: integer("failure_count"),
  errorReportKey: text("error_report_key"),
  requestedBy: uuid("requested_by").references(() => users.id, {
    onDelete: "set null",
  }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt,
});
