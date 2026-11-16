ALTER TABLE "integration_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "integrations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_rate_limits" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Detach the log from the configuration table BEFORE dropping it: the drop is
-- CASCADE, so it would silently take this constraint with it and the ALTER
-- below would then fail with "constraint does not exist".
ALTER TABLE "integration_sync_logs" DROP CONSTRAINT "integration_sync_logs_integration_id_integrations_id_fk";--> statement-breakpoint
DROP TABLE "integration_events" CASCADE;--> statement-breakpoint
DROP TABLE "integrations" CASCADE;--> statement-breakpoint
DROP TABLE "webhook_rate_limits" CASCADE;--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "integration_sync_logs" ALTER COLUMN "integration_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_sync_logs" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_sync_logs_org_started_at_idx" ON "integration_sync_logs" USING btree ("organization_id","started_at");