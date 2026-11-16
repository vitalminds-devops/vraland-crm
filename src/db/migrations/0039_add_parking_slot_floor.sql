ALTER TABLE "parking_slots" ADD COLUMN IF NOT EXISTS "floor_id" uuid REFERENCES "floors"("id") ON DELETE set null;
