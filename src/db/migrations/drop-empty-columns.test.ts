import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableColumns, type Table } from "drizzle-orm";
import { expect, it } from "vitest";
import {
  calendarEvents,
  contacts,
  dealAgents,
  deals,
  developments,
  documents,
  organizations,
  properties,
} from "@/db/schema";

const dropped: [Table, string, string][] = [
  [properties, "properties", "floor_area_sqm"],
  [developments, "developments", "latitude"],
  [developments, "developments", "longitude"],
  [deals, "deals", "financing_type"],
  [dealAgents, "deal_agents", "commission_split_percent"],
  [contacts, "contacts", "last_contacted_at"],
  [calendarEvents, "calendar_events", "external_calendar_provider"],
  [calendarEvents, "calendar_events", "external_event_id"],
  [documents, "documents", "esign_provider"],
  [documents, "documents", "external_envelope_id"],
  [organizations, "organizations", "address_line1"],
  [organizations, "organizations", "address_line2"],
  [organizations, "organizations", "city"],
  [organizations, "organizations", "province"],
  [organizations, "organizations", "postal_code"],
];

it("drops only columns that hold no value, and the schema no longer has them", () => {
  const sql = readFileSync(resolve(__dirname, "0084_drop_empty_columns.sql"), "utf8");
  for (const [table, name, column] of dropped) {
    expect(sql).toContain(`['${name}', '${column}']`);
    expect(Object.values(getTableColumns(table)).map((c) => c.name)).not.toContain(column);
  }
  expect(sql).toContain("SELECT EXISTS (SELECT 1 FROM %I WHERE %I IS NOT NULL)");
  expect(sql).toContain("FROM information_schema.columns");
  // A property's own map position is still filled in by the property form.
  expect(Object.values(getTableColumns(properties)).map((c) => c.name)).toContain("latitude");
});
