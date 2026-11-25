-- Parking types (e.g. Standard 2.5 x 5 m, Tandem 2.5 x 10 m) with their own price and reservation fee,
-- designed once on the Design page and dragged onto floors; each slot remembers its type.
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "parking_types" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "parking_slots" ADD COLUMN IF NOT EXISTS "parking_type_id" varchar(40);
