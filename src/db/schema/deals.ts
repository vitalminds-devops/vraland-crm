import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { contacts } from "./contacts";
import { organizations, users } from "./organization";
import { developments, properties, units } from "./properties";
import { createdAt, updatedAt } from "./shared";

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar({ length: 100 }).notNull(),
    slug: varchar({ length: 100 }).notNull(),
    position: smallint().notNull(),
    defaultProbability: numeric("default_probability", {
      precision: 5,
      scale: 2,
    })
      .default("0")
      .notNull(),
    isWonStage: boolean("is_won_stage").default(false).notNull(),
    isLostStage: boolean("is_lost_stage").default(false).notNull(),
    isCancelledStage: boolean("is_cancelled_stage").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    requiresApproval: boolean("requires_approval").default(false).notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [unique().on(t.organizationId, t.slug), unique().on(t.organizationId, t.position)],
);

export const lostReasons = pgTable(
  "lost_reasons",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull(),
    description: text(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt,
  },
  (t) => [unique().on(t.organizationId, t.name)],
);

export const deals = pgTable(
  "deals",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealCode: varchar("deal_code", { length: 50 }).notNull(),
    title: varchar({ length: 220 }).notNull(),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    developmentId: uuid("development_id").references(() => developments.id, {
      onDelete: "set null",
    }),
    // Retired: the units are unitIds (0085 copied this into it). Kept because migrations 0043,
    // 0071 and 0080 still read it when db:migrate replays an adopted database.
    unitId: uuid("unit_id").references(() => units.id, {
      onDelete: "set null",
    }),
    unitIds: uuid("unit_ids").array().default([]).notNull(),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStages.id),
    status: varchar({ length: 20 }).default("open").notNull(),
    dealType: varchar("deal_type", { length: 20 }).default("sale").notNull(),
    currency: varchar({ length: 3 }).default("PHP").notNull(),
    amount: numeric({ precision: 18, scale: 2 }),
    parkingSlots: smallint("parking_slots").default(0).notNull(),
    parkingSlotIds: uuid("parking_slot_ids").array().default([]).notNull(),
    parkingAmount: numeric("parking_amount", { precision: 18, scale: 2 }),
    expectedCommission: numeric("expected_commission", {
      precision: 18,
      scale: 2,
    }),
    probability: numeric({ precision: 5, scale: 2 }).default("0").notNull(),
    primaryAgentUserId: uuid("primary_agent_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    brokerUserId: uuid("broker_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    expectedCloseDate: date("expected_close_date"),
    actualCloseDate: date("actual_close_date"),
    lostReasonId: uuid("lost_reason_id").references(() => lostReasons.id, {
      onDelete: "set null",
    }),
    lostNotes: text("lost_notes"),
    cancellationReason: text("cancellation_reason"),
    // The reservation fee and monthly amortization quoted when the units and parking were chosen,
    // so later unit type or slot edits don't change the sale. Whether they are paid comes from its
    // payments (see billing/lib/deal-payment.ts).
    reservationFee: numeric("reservation_fee", { precision: 18, scale: 2 }),
    monthlyAmortization: numeric("monthly_amortization", { precision: 18, scale: 2 }),
    /** The parking part of the quoted reservation fee; the total stays in reservationFee. */
    parkingReservationFee: numeric("parking_reservation_fee", { precision: 18, scale: 2 }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    unique().on(t.organizationId, t.dealCode),
    index("deals_org_broker_user_id_idx").on(t.organizationId, t.brokerUserId),
    index("deals_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const dealContacts = pgTable(
  "deal_contacts",
  {
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: varchar({ length: 30 }).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.dealId, t.contactId, t.role] }),
    index("deal_contacts_contact_id_idx").on(t.contactId),
  ],
);

export const dealAgents = pgTable(
  "deal_agents",
  {
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar({ length: 30 }).default("agent").notNull(),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.dealId, t.userId, t.role] })],
);

export const dealStageHistory = pgTable(
  "deal_stage_history",
  {
    id: uuid().defaultRandom().primaryKey(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    fromStageId: uuid("from_stage_id").references(() => pipelineStages.id, {
      onDelete: "set null",
    }),
    toStageId: uuid("to_stage_id")
      .notNull()
      .references(() => pipelineStages.id),
    changedBy: uuid("changed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text(),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("deal_stage_history_deal_changed_idx").on(t.dealId, t.changedAt.desc())],
);

export const dealStageChangeRequests = pgTable(
  "deal_stage_change_requests",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    fromStageId: uuid("from_stage_id").references(() => pipelineStages.id, {
      onDelete: "set null",
    }),
    toStageId: uuid("to_stage_id")
      .notNull()
      .references(() => pipelineStages.id),
    requestedBy: uuid("requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: varchar({ length: 20 }).default("pending").notNull(),
    reason: text(),
    // Carried to the deal when a "mark lost" request is approved.
    lostReasonId: uuid("lost_reason_id").references(() => lostReasons.id, {
      onDelete: "set null",
    }),
    lostNotes: text("lost_notes"),
    decidedBy: uuid("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("deal_stage_change_requests_deal_status_idx").on(t.dealId, t.status),
    index("deal_stage_change_requests_org_status_idx").on(t.organizationId, t.status),
  ],
);

/** Who earns what on a won opportunity, worked out from Settings → Commissions when it is won. */
export const dealCommissions = pgTable(
  "deal_commissions",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The role name at the time, so renaming a role later does not rewrite history. */
    roleName: varchar("role_name", { length: 100 }).notNull(),
    rate: numeric({ precision: 5, scale: 2 }).notNull(),
    baseAmount: numeric("base_amount", { precision: 18, scale: 2 }).notNull(),
    amount: numeric({ precision: 18, scale: 2 }).notNull(),
    createdAt,
  },
  (t) => [
    unique().on(t.dealId, t.userId),
    index("deal_commissions_org_user_idx").on(t.organizationId, t.userId),
  ],
);
