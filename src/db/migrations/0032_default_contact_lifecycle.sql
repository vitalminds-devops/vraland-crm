-- Lifecycle is no longer picked on the contact form: every contact takes the default, Active.
UPDATE "contacts" SET "lifecycle_stage" = 'active_client'
WHERE "lifecycle_stage" IS DISTINCT FROM 'active_client';
ALTER TABLE "contacts" ALTER COLUMN "lifecycle_stage" SET DEFAULT 'active_client';
