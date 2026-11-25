-- Each unit type can set its own reservation fee and monthly amortization; a unit without them
-- uses its property's.
ALTER TABLE "unit_types" ADD COLUMN IF NOT EXISTS "reservation_fee" numeric(18, 2);
ALTER TABLE "unit_types" ADD COLUMN IF NOT EXISTS "monthly_amortization" numeric(18, 2);
