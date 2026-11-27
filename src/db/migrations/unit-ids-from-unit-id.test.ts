import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("copies a lone unit_id into an empty unit list only, so it can run again", () => {
  const sql = readFileSync(resolve(__dirname, "0085_unit_ids_from_unit_id.sql"), "utf8");
  expect(sql).toContain(`SET "unit_ids" = ARRAY["unit_id"]`);
  expect(sql).toContain(`WHERE "unit_id" IS NOT NULL AND cardinality("unit_ids") = 0`);
  // unit_id itself stays: migrations 0043, 0071 and 0080 still read it on replay.
  expect(sql).not.toMatch(/DROP COLUMN/i);
});
