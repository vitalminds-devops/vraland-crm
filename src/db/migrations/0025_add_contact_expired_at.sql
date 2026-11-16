-- A lead left in Leads for 30 days expires: its contact is archived with expired_at set and cannot be restored.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "expired_at" timestamp with time zone;
