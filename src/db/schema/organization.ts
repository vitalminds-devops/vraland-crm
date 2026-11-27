import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  char,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { citext, createdAt, updatedAt } from "./shared";

export const organizations = pgTable("organizations", {
  id: uuid().defaultRandom().primaryKey(),
  name: varchar({ length: 180 }).notNull(),
  code: varchar({ length: 50 }).notNull().unique(),
  legalName: varchar("legal_name", { length: 220 }),
  email: citext(),
  phone: varchar({ length: 50 }),
  website: varchar({ length: 255 }),
  currency: char({ length: 3 }).default("PHP").notNull(),
  timezone: varchar({ length: 80 }).default("Asia/Manila").notNull(),
  countryCode: char("country_code", { length: 2 }).default("PH").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt,
  updatedAt,
});

export const users = pgTable(
  "users",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: citext().notNull(),
    brokerId: uuid("broker_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    firstName: varchar("first_name", { length: 120 }).notNull(),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    phone: varchar({ length: 50 }),
    avatarUrl: text("avatar_url"),
    // Retired: data access is the records.* permissions now (migration 0048). Kept as the old values.
    dataScopeOverride: varchar("data_scope_override", { length: 30 }),
    status: varchar({ length: 30 }).default("active").notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt,
    updatedAt,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique().on(table.organizationId, table.email),
    index("users_broker_id_idx").on(table.brokerId),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar({ length: 100 }).notNull(),
    slug: varchar({ length: 100 }).notNull(),
    description: text(),
    isSystem: boolean("is_system").default(false).notNull(),
    // Retired: data access is the records.* permissions now (migration 0048). Kept as the old values.
    dataScope: varchar("data_scope", { length: 30 }).default("own").notNull(),
    /** Percentage paid to holders of this role, set in Settings → Commissions. */
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }),
    createdAt,
    updatedAt,
  },
  (table) => [unique().on(table.organizationId, table.slug)],
);

/**
 * A role placed under another on Settings → Commissions. When a user of `roleId` sells and their
 * broker holds `parentRoleId`, the seller earns `sellerRate` and the broker `parentRate` (percent).
 */
export const commissionLinks = pgTable(
  "commission_links",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    parentRoleId: uuid("parent_role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    sellerRate: numeric("seller_rate", { precision: 5, scale: 2 }).notNull(),
    parentRate: numeric("parent_rate", { precision: 5, scale: 2 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [unique().on(table.roleId, table.parentRoleId)],
);

export const permissions = pgTable("permissions", {
  id: uuid().defaultRandom().primaryKey(),
  key: varchar({ length: 150 }).notNull().unique(),
  module: varchar({ length: 80 }).notNull(),
  description: text(),
  createdAt,
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    assignedBy: uuid("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

/** Changes to one user's permissions on top of their roles: granted adds a permission, false removes it. */
export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 150 }).notNull(),
    granted: boolean().notNull(),
    assignedBy: uuid("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.userId, table.permissionKey] })],
);

/** The last running number given out per kind of record code (OPP-000123, CON-000045, ...). */
export const codeCounters = pgTable(
  "code_counters",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: varchar({ length: 20 }).notNull(),
    lastValue: integer("last_value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.kind] })],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  roles: many(roles),
}));
export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  broker: one(users, {
    fields: [users.brokerId],
    references: [users.id],
    relationName: "brokerAgents",
  }),
  agents: many(users, { relationName: "brokerAgents" }),
  roles: many(userRoles),
}));
