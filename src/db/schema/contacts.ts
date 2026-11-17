import {
  boolean,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { organizations, users } from "./organization";
import { documents } from "./documents";
import { developments } from "./properties";
import { citext, createdAt, updatedAt } from "./shared";


export const contacts = pgTable(
  "contacts",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactCode: varchar("contact_code", { length: 50 }).notNull(),
    firstName: varchar("first_name", { length: 120 }).notNull(),
    middleName: varchar("middle_name", { length: 120 }),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    companyName: varchar("company_name", { length: 180 }),
    birthDate: date("birth_date"),
    gender: varchar({ length: 20 }),
    civilStatus: varchar("civil_status", { length: 20 }),
    citizenship: varchar({ length: 80 }),
    tinNumber: varchar("tin_number", { length: 50 }),
    landline: varchar({ length: 50 }),
    prcLicenseNumber: varchar("prc_license_number", { length: 50 }),
    currentAddressLine1: varchar("current_address_line_1", { length: 255 }),
    currentBarangay: varchar("current_barangay", { length: 120 }),
    currentCity: varchar("current_city", { length: 120 }),
    currentProvince: varchar("current_province", { length: 120 }),
    currentPostalCode: varchar("current_postal_code", { length: 20 }),
    currentCountry: varchar("current_country", { length: 100 }),
    email: citext(),
    mobilePhone1: varchar("mobile_phone_1", { length: 50 }),
    mobilePhone2: varchar("mobile_phone_2", { length: 50 }),
    mobilePhone3: varchar("mobile_phone_3", { length: 50 }),
    whatsappNumber: varchar("whatsapp_number", { length: 50 }),
    viberNumber: varchar("viber_number", { length: 50 }),
    instagramHandle: varchar("instagram_handle", { length: 120 }),
    facebookHandle: varchar("facebook_handle", { length: 120 }),
    emailNormalized: text("email_normalized"),
    mobilePhoneNormalized1: text("mobile_phone_normalized_1"),
    mobilePhoneNormalized2: text("mobile_phone_normalized_2"),
    mobilePhoneNormalized3: text("mobile_phone_normalized_3"),
    preferredContactMethods: text("preferred_contact_methods")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    lifecycleStage: varchar("lifecycle_stage", { length: 30 }),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    brokerUserId: uuid("broker_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    purchaseType: varchar("purchase_type", { length: 20 }),
    employmentType: varchar("employment_type", { length: 80 }),
    annualIncome: numeric("annual_income", { precision: 18, scale: 2 }),
    financingPreference: varchar("financing_preference", { length: 40 }),
    financingPreferenceOther: varchar("financing_preference_other", {
      length: 180,
    }),
    bankName: varchar("bank_name", { length: 180 }),
    budgetMin: numeric("budget_min", { precision: 18, scale: 2 }),
    budgetMax: numeric("budget_max", { precision: 18, scale: 2 }),
    preferredDevelopmentId: uuid("preferred_development_id").references(() => developments.id, {
      onDelete: "set null",
    }),
    preferredUnitIds: uuid("preferred_unit_ids")
      .array()
      .default(sql`'{}'::uuid[]`)
      .notNull(),
    notes: text(),
    marketingConsent: boolean("marketing_consent").default(false).notNull(),
    consentRecordedAt: timestamp("consent_recorded_at", { withTimezone: true }),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approvalStatus: varchar("approval_status", { length: 20 }).default("approved").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Set when the lead expired after 30 days in Leads: archived for good, never restored. */
    expiredAt: timestamp("expired_at", { withTimezone: true }),
  },
  (t) => [
    unique().on(t.organizationId, t.contactCode),
    index("contacts_org_email_normalized_idx").on(t.organizationId, t.emailNormalized),
    index("contacts_org_mobile_normalized_1_idx").on(t.organizationId, t.mobilePhoneNormalized1),
    index("contacts_org_mobile_normalized_2_idx").on(t.organizationId, t.mobilePhoneNormalized2),
    index("contacts_org_mobile_normalized_3_idx").on(t.organizationId, t.mobilePhoneNormalized3),
    index("contacts_org_broker_user_id_idx").on(t.organizationId, t.brokerUserId),
    index("contacts_org_preferred_development_idx").on(t.organizationId, t.preferredDevelopmentId),
    uniqueIndex("contacts_org_email_normalized_unique")
      .on(t.organizationId, t.emailNormalized)
      .where(sql`${t.emailNormalized} is not null and ${t.deletedAt} is null`),
  ],
);

export const contactCategories = pgTable(
  "contact_categories",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar({ length: 80 }).notNull(),
    slug: varchar({ length: 80 }).notNull(),
    description: text(),
    createdAt,
  },
  (t) => [unique().on(t.organizationId, t.slug)],
);

export const contactNotes = pgTable("contact_notes", {
  id: uuid().defaultRandom().primaryKey(),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  note: text().notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(),
  createdAt,
  updatedAt,
});

export const contactAssignmentHistory = pgTable("contact_assignment_history", {
  id: uuid().defaultRandom().primaryKey(),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  fromUserId: uuid("from_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  toUserId: uuid("to_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  changedBy: uuid("changed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  reason: text(),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contactBrokerHistory = pgTable("contact_broker_history", {
  id: uuid().defaultRandom().primaryKey(),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  fromBrokerUserId: uuid("from_broker_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  toBrokerUserId: uuid("to_broker_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  changedBy: uuid("changed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  reason: text(),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contactDocumentRequirements = pgTable(
  "contact_document_requirements",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    documentType: varchar("document_type", { length: 80 }).notNull(),
    label: varchar({ length: 180 }).notNull(),
    status: varchar({ length: 20 }).default("not_submitted").notNull(),
    notes: text(),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    satisfiedAt: timestamp("satisfied_at", { withTimezone: true }),
    satisfiedBy: uuid("satisfied_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique().on(t.contactId, t.documentType),
    foreignKey({
      columns: [t.organizationId],
      foreignColumns: [organizations.id],
      name: "contact_document_requirements_organization_id_fk",
    }).onDelete("cascade"),
  ],
);
