-- Parking can carry a monthly amortization, like a unit type. A slot takes its parking type's
-- amount; an opportunity keeps the parking part it was quoted beside its total. Safe to run again.
ALTER TABLE "parking_slots" ADD COLUMN IF NOT EXISTS "monthly_amortization" numeric(18, 2);
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "parking_monthly_amortization" numeric(18, 2);
