ALTER TABLE "developments" ADD COLUMN "cover_image_storage_key" text;--> statement-breakpoint
ALTER TABLE "developments" ADD COLUMN "cover_image_mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "cover_image_storage_key" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "cover_image_mime_type" varchar(100);