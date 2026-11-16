-- Branches are removed: the "branch" data scope widens to the whole organization.
UPDATE "roles" SET "data_scope" = 'organization' WHERE "data_scope" = 'branch';--> statement-breakpoint
UPDATE "users" SET "data_scope_override" = 'organization' WHERE "data_scope_override" = 'branch';--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "branch_id";--> statement-breakpoint
ALTER TABLE "deals" DROP COLUMN IF EXISTS "branch_id";--> statement-breakpoint
ALTER TABLE "properties" DROP COLUMN IF EXISTS "branch_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "branch_id";--> statement-breakpoint
DROP TABLE IF EXISTS "branches";
