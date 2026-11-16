-- Lookups by deal/contact, the activity feed, the notification bell and the
-- pipeline filter all scanned whole tables.
CREATE INDEX IF NOT EXISTS "activities_contact_id_idx" ON "activities" ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_deal_id_idx" ON "activities" ("deal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_org_created_at_idx" ON "activities" ("organization_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_contact_id_idx" ON "tasks" ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_deal_id_idx" ON "tasks" ("deal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_org_assigned_user_id_idx" ON "tasks" ("organization_id", "assigned_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_is_read_idx" ON "notifications" ("user_id", "is_read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_org_status_idx" ON "deals" ("organization_id", "status");
