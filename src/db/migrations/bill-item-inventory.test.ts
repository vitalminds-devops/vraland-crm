import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("links only unlinked lines, to their own opportunity's units and slots, and can run again", () => {
  const sql = readFileSync(resolve(__dirname, "0080_link_existing_bill_items.sql"), "utf8");
  // Both backfills skip lines that are already linked and look only at the deal's own picks.
  expect(sql.match(/bi\."unit_id" IS NULL AND bi\."parking_slot_id" IS NULL/g)).toHaveLength(2);
  expect(sql).toContain(`u."id" = d."unit_id" OR u."id" = ANY(d."unit_ids")`);
  expect(sql).toContain(`s."id" = ANY(d."parking_slot_ids")`);
  // "Unit 2A" must not match "Unit 2A1": the code is followed by the end or " · ".
  expect(sql).toContain(`'Unit ' || u."code" || ' · '`);
});
