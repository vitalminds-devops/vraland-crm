import { relations } from "drizzle-orm";
import { index, pgTable, unique, uuid, varchar } from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./shared";
import { organizations, users } from "./organization";

export const agents = pgTable(
  "agents",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    license: varchar({ length: 180 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("agents_user_id_unique").on(table.userId),
    index("agents_organization_id_idx").on(table.organizationId),
  ],
);

export const agentsRelations = relations(agents, ({ one }) => ({
  organization: one(organizations, {
    fields: [agents.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [agents.userId],
    references: [users.id],
  }),
}));
