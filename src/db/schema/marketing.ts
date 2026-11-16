import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { contacts } from "./contacts";
import { deals } from "./deals";
import { organizations, users } from "./organization";
import { createdAt, updatedAt } from "./shared";

export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar({ length: 180 }).notNull(),
    subject: varchar({ length: 255 }).notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text"),
    category: varchar({ length: 80 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (t) => [unique().on(t.organizationId, t.name)],
);

export const smsTemplates = pgTable(
  "sms_templates",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar({ length: 180 }).notNull(),
    body: text().notNull(),
    category: varchar({ length: 80 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (t) => [unique().on(t.organizationId, t.name)],
);

export const campaigns = pgTable("campaigns", {
  id: uuid().defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar({ length: 180 }).notNull(),
  channel: varchar({ length: 20 }).notNull(),
  status: varchar({ length: 20 }).default("draft").notNull(),
  emailTemplateId: uuid("email_template_id").references(() => emailTemplates.id, {
    onDelete: "set null",
  }),
  smsTemplateId: uuid("sms_template_id").references(() => smsTemplates.id, {
    onDelete: "set null",
  }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt,
  updatedAt,
});

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    deliveryStatus: varchar("delivery_status", { length: 20 }).default("pending").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    errorMessage: text("error_message"),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.contactId] })],
);

export const automationSequences = pgTable("automation_sequences", {
  id: uuid().defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar({ length: 180 }).notNull(),
  description: text(),
  triggerType: varchar("trigger_type", { length: 50 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt,
  updatedAt,
});

export const automationSteps = pgTable(
  "automation_steps",
  {
    id: uuid().defaultRandom().primaryKey(),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => automationSequences.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    actionType: varchar("action_type", { length: 30 }).notNull(),
    delayMinutes: integer("delay_minutes").default(0).notNull(),
    emailTemplateId: uuid("email_template_id").references(() => emailTemplates.id, {
      onDelete: "set null",
    }),
    smsTemplateId: uuid("sms_template_id").references(() => smsTemplates.id, {
      onDelete: "set null",
    }),
    taskTitle: varchar("task_title", { length: 220 }),
    configuration: jsonb().default({}).notNull(),
    createdAt,
  },
  (t) => [unique().on(t.sequenceId, t.stepOrder)],
);

export const automationEnrollments = pgTable("automation_enrollments", {
  id: uuid().defaultRandom().primaryKey(),
  sequenceId: uuid("sequence_id")
    .notNull()
    .references(() => automationSequences.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, {
    onDelete: "cascade",
  }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
  status: varchar({ length: 20 }).default("active").notNull(),
  currentStepOrder: integer("current_step_order"),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const automationRuns = pgTable("automation_runs", {
  id: uuid().defaultRandom().primaryKey(),
  enrollmentId: uuid("enrollment_id")
    .notNull()
    .references(() => automationEnrollments.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").references(() => automationSteps.id, {
    onDelete: "set null",
  }),
  status: varchar({ length: 20 }).notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  metadata: jsonb().default({}).notNull(),
  createdAt,
});
