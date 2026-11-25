-- Parking has its own reservation fee; each slot may set its own price and reservation fee,
-- falling back to the property's parking price and parking reservation fee.
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "parking_reservation_fee" numeric(18, 2);
ALTER TABLE "parking_slots" ADD COLUMN IF NOT EXISTS "price" numeric(18, 2);
ALTER TABLE "parking_slots" ADD COLUMN IF NOT EXISTS "reservation_fee" numeric(18, 2);
