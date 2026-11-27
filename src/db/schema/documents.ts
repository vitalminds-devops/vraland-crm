import {
  bigint,
  index,
  boolean,
  date,
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
import { createdAt, updatedAt } from "./shared";

export const documents = pgTable(
  "documents",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    documentType: varchar("document_type", { length: 50 }).default("general").notNull(),
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    certificateNumber: varchar("certificate_number", { length: 180 }),
    name: varchar({ length: 220 }).notNull(),
    category: varchar({ length: 50 }).default("other").notNull(),
    isSensitive: boolean("is_sensitive").default(false).notNull(),
    status: varchar({ length: 30 }).default("draft").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: varchar("mime_type", { length: 120 }),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    esignProvider: varchar("esign_provider", { length: 80 }),
    externalEnvelopeId: varchar("external_envelope_id", { length: 255 }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("documents_org_created_idx").on(t.organizationId, t.createdAt),
    index("documents_contact_id_idx").on(t.contactId),
    index("documents_deal_id_idx").on(t.dealId),
  ],
);
