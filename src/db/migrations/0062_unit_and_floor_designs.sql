-- Units and floors are now designed by dragging pieces; uploaded plan pictures and traces are gone.
ALTER TABLE "unit_types" ADD COLUMN IF NOT EXISTS "layout" jsonb;
ALTER TABLE "floors" ADD COLUMN IF NOT EXISTS "layout" jsonb;
DROP INDEX IF EXISTS "floors_plan_idx";
ALTER TABLE "floors" DROP COLUMN IF EXISTS "plan_id";
DROP TABLE IF EXISTS "floor_plans";
