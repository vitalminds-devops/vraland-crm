ALTER TABLE "deal_stage_change_requests" ADD COLUMN IF NOT EXISTS "lost_reason_id" uuid REFERENCES "lost_reasons"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "deal_stage_change_requests" ADD COLUMN IF NOT EXISTS "lost_notes" text;
