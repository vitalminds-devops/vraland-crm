import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { defaultLostReasons } from "../seeds/lost-reasons";

it("adds the same starter loss reasons as the seed, only where an organization has none", () => {
  const sql = readFileSync(resolve(__dirname, "0078_default_lost_reasons.sql"), "utf8");
  for (const reason of defaultLostReasons)
    expect(sql).toContain(`'${reason.name.replace("'", "''")}'`);
  expect(sql).toContain('WHERE NOT EXISTS (SELECT 1 FROM "lost_reasons" lr');
  expect(sql).toContain("ON CONFLICT DO NOTHING");
});
