-- Commission is set per role in Settings -> Commissions, not per user.
ALTER TABLE "users" DROP COLUMN IF EXISTS "commission_rate";
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "commission_rate" numeric(5, 2);
