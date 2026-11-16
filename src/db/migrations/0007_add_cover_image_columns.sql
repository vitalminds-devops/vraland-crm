-- Developments and properties gained a stored cover image, but the columns
-- were only ever in `src/db/schema` and the baseline -- databases created
-- before that change never received them, so every listing query failed with
-- `column "cover_image_storage_key" does not exist`. IF NOT EXISTS keeps this
-- safe on databases that already have them.
ALTER TABLE "developments"
	ADD COLUMN IF NOT EXISTS "cover_image_storage_key" text,
	ADD COLUMN IF NOT EXISTS "cover_image_mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "properties"
	ADD COLUMN IF NOT EXISTS "cover_image_storage_key" text,
	ADD COLUMN IF NOT EXISTS "cover_image_mime_type" varchar(100);
