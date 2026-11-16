ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "parking_slots" smallint NOT NULL DEFAULT 0;
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "parking_amount" numeric(18, 2);
