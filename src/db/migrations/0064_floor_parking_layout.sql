-- A floor's designed parking: where each slot is, and the drive paths, ramps and pillars.
ALTER TABLE "floors" ADD COLUMN IF NOT EXISTS "parking_layout" jsonb;
