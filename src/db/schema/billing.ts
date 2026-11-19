import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { deals } from "./deals";
import { documents } from "./documents";
import { organizations, users } from "./organization";
import { createdAt, updatedAt } from "./shared";

/**
 * What a broker is billed for one opportunity. The unit columns hold the totals of its `billItems`
 * (labels joined), kept in step by saveBill so lists and balances need no join.
 */
export const bills = pgTable(
  "bills",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    /** The billed broker, copied from the opportunity when the bill is saved. */
    brokerUserId: uuid("broker_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    unitLabel: varchar("unit_label", { length: 220 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
    miscellaneousFee: numeric("miscellaneous_fee", { precision: 18, scale: 2 })
      .default("0")
      .notNull(),
    /** Taken off the selling price before the miscellaneous fee is added. */
    reservationDiscount: numeric("reservation_discount", { precision: 18, scale: 2 })
      .default("0")
      .notNull(),
    notes: text(),
    applicantDetails: jsonb("applicant_details").$type<Record<string, string>>(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique().on(t.dealId),
    index("bills_org_broker_user_id_idx").on(t.organizationId, t.brokerUserId),
  ],
);

/** One unit on a bill: a lead buying two units has two lines on the opportunity's one bill. */
export const billItems = pgTable(
  "bill_items",
  {
    id: uuid().defaultRandom().primaryKey(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    position: integer().default(0).notNull(),
    unitLabel: varchar("unit_label", { length: 220 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
    miscellaneousFee: numeric("miscellaneous_fee", { precision: 18, scale: 2 })
      .default("0")
      .notNull(),
    createdAt,
  },
  (t) => [index("bill_items_bill_id_idx").on(t.billId, t.position)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Restrict: a bill with recorded money cannot vanish with its payments.
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "restrict" }),
    amount: numeric({ precision: 18, scale: 2 }).notNull(),
    paidOn: date("paid_on").notNull(),
    /** One of `paymentMethods` in the billing schema. */
    method: varchar({ length: 20 }).notNull(),
    /** One of `paymentClassifications`: a reservation unlocks Opportunity, the first monthly unlocks Won. */
    classification: varchar({ length: 20 }).default("downpayment").notNull(),
    referenceNo: varchar("reference_no", { length: 120 }),
    transactionSlipDocumentId: uuid("transaction_slip_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    notes: text(),
    recordedBy: uuid("recorded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("payments_bill_id_idx").on(t.billId),
    index("payments_org_paid_on_idx").on(t.organizationId, t.paidOn),
  ],
);
