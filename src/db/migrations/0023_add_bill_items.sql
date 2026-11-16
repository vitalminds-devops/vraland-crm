-- A bill has one line per unit, so a lead buying two units is billed for both on one bill.
-- Existing bills become a single line each; IF NOT EXISTS keeps this safe after db:push.
CREATE TABLE IF NOT EXISTS "bill_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bill_id" uuid NOT NULL REFERENCES "bills"("id") ON DELETE CASCADE,
  "position" integer DEFAULT 0 NOT NULL,
  "unit_label" varchar(220) NOT NULL,
  "unit_price" numeric(18, 2) NOT NULL,
  "miscellaneous_fee" numeric(18, 2) DEFAULT '0' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "bill_items_bill_id_idx" ON "bill_items" ("bill_id", "position");
INSERT INTO "bill_items" ("bill_id", "position", "unit_label", "unit_price", "miscellaneous_fee")
SELECT b."id", 0, b."unit_label", b."unit_price", b."miscellaneous_fee"
FROM "bills" b
WHERE NOT EXISTS (SELECT 1 FROM "bill_items" i WHERE i."bill_id" = b."id");
