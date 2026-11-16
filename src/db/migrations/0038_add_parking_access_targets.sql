ALTER TABLE "property_access_grant_targets" ADD COLUMN IF NOT EXISTS "parking_slot_id" uuid REFERENCES "parking_slots"("id") ON DELETE cascade;
