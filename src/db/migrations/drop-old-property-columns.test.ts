import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { expect, it } from "vitest";
import { developments, properties } from "@/db/schema";

const dropped = [
  "asking_price",
  "monthly_rent",
  "parking_price",
  "reservation_fee",
  "parking_reservation_fee",
  "commission_rate",
  "lot_area_sqm",
  "bedrooms",
  "bathrooms",
  "purchase_type",
  "cover_image_storage_key",
  "cover_image_mime_type",
];
const names = (table: typeof properties | typeof developments) =>
  Object.values(getTableColumns(table)).map((column) => column.name);

it("drops the old property columns, can run again, and leaves development covers", () => {
  const sql = readFileSync(resolve(__dirname, "0082_drop_old_property_columns.sql"), "utf8");
  expect(sql.match(/ALTER TABLE "properties" DROP COLUMN IF EXISTS "(\w+)"/g)).toEqual(
    dropped.map((column) => `ALTER TABLE "properties" DROP COLUMN IF EXISTS "${column}"`),
  );
  expect(names(properties).filter((column) => dropped.includes(column))).toEqual([]);
  expect(names(developments)).toContain("cover_image_storage_key");
});

it("records the price copies instead of replaying them once the old columns are gone", () => {
  const migrate = readFileSync(resolve(__dirname, "../scripts/migrate.ts"), "utf8");
  expect(migrate).toContain(`"0061_unit_prices_from_property.sql"`);
  expect(migrate).toContain(`"0069_prices_on_types.sql"`);
  expect(migrate).toMatch(/column_name = 'asking_price'\) AS applied/);
  expect(migrate).toMatch(/column_name = 'monthly_rent'\) AS applied/);
});
