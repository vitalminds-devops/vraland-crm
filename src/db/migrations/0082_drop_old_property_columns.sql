-- Drops the old property form's columns: prices and fees now live on unit types, parking types and
-- slots (0061, 0069), and the rest were never shown. Safe to run again.
ALTER TABLE "properties" DROP COLUMN IF EXISTS "asking_price";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "monthly_rent";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "parking_price";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "reservation_fee";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "parking_reservation_fee";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "commission_rate";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "lot_area_sqm";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "bedrooms";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "bathrooms";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "purchase_type";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "cover_image_storage_key";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "cover_image_mime_type";
