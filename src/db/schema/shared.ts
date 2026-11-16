import { customType, timestamp } from "drizzle-orm/pg-core";

export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});
export const inet = customType<{ data: string }>({ dataType: () => "inet" });

export const createdAt = timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const updatedAt = timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
