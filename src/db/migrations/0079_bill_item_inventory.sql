-- A bill line remembers which unit or parking slot it bills, so the price a client agreed to stays
-- with that unit when the opportunity's units change, even after a rename. Older lines stay empty
-- and are matched by their label. Safe to run again.
ALTER TABLE "bill_items" ADD COLUMN IF NOT EXISTS "unit_id" uuid REFERENCES "units"("id") ON DELETE SET NULL;
ALTER TABLE "bill_items" ADD COLUMN IF NOT EXISTS "parking_slot_id" uuid REFERENCES "parking_slots"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "bill_items_unit_id_idx" ON "bill_items" ("unit_id");
CREATE INDEX IF NOT EXISTS "bill_items_parking_slot_id_idx" ON "bill_items" ("parking_slot_id");
