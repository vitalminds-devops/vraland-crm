import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { contacts } from "./contacts";
import { deals } from "./deals";
import { organizations, users } from "./organization";
import { properties } from "./properties";
import { createdAt, updatedAt } from "./shared";

export const tasks = pgTable(
  "tasks",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: varchar({ length: 220 }).notNull(),
    description: text(),
    taskType: varchar("task_type", { length: 30 }).default("follow_up").notNull(),
    priority: varchar({ length: 20 }).default("medium").notNull(),
    status: varchar({ length: 20 }).default("todo").notNull(),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "cascade",
    }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    reminderAt: timestamp("reminder_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_contact_id_idx").on(t.contactId),
    index("tasks_deal_id_idx").on(t.dealId),
    index("tasks_org_assigned_user_id_idx").on(t.organizationId, t.assignedUserId),
  ],
);
