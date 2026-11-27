import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { expect, it } from "vitest";
import { deals, users } from "@/db/schema";

it("drops the retired columns, can run again, and the schema no longer has them", () => {
  const sql = readFileSync(resolve(__dirname, "0081_drop_retired_columns.sql"), "utf8");
  const drops = sql.match(/DROP COLUMN IF EXISTS "\w+"/g) ?? [];
  expect(drops).toEqual([
    'DROP COLUMN IF EXISTS "reservation_fee_paid_at"',
    'DROP COLUMN IF EXISTS "reservation_fee_paid_by"',
    'DROP COLUMN IF EXISTS "password_hash"',
  ]);
  expect(sql).not.toMatch(/DROP COLUMN (?!IF EXISTS)/);
  const names = (table: typeof deals | typeof users) =>
    Object.values(getTableColumns(table)).map((column) => column.name);
  expect(names(deals)).not.toContain("reservation_fee_paid_at");
  expect(names(deals)).not.toContain("reservation_fee_paid_by");
  expect(names(users)).not.toContain("password_hash");
});
