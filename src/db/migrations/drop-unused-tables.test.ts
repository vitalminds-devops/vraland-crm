import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import * as schema from "@/db/schema";

it("drops only empty unused tables, signers after their events, and can run again", () => {
  const sql = readFileSync(resolve(__dirname, "0083_drop_unused_tables.sql"), "utf8");
  expect(sql).toContain(
    "ARRAY['esign_events', 'document_signers', 'offers', 'property_media', 'contact_categories']",
  );
  // A table with rows is kept, a missing one is skipped, and a referenced one never fails the run.
  expect(sql).toContain("SELECT EXISTS (SELECT 1 FROM %I)");
  expect(sql).toContain("to_regclass('public.' || name) IS NOT NULL");
  expect(sql).toContain("EXCEPTION WHEN dependent_objects_still_exist");
  expect(sql).not.toMatch(/CASCADE/i);
  for (const name of [
    "offers",
    "propertyMedia",
    "documentSigners",
    "esignEvents",
    "contactCategories",
  ])
    expect(schema).not.toHaveProperty(name);
});
