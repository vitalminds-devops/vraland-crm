-- Billing: track each lead's reservation fee and whether it has been paid.
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "reservation_fee" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "reservation_fee_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "reservation_fee_paid_by" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "deals" ADD CONSTRAINT "deals_reservation_fee_paid_by_users_id_fk"
    FOREIGN KEY ("reservation_fee_paid_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- Billing is administrator-only.
INSERT INTO "permissions" ("key", "module", "description")
VALUES
  ('billing.view', 'billing', 'Open Billing and see every lead''s reservation fee and whether it is paid. Effective only alongside an administrator role.'),
  ('billing.manage', 'billing', 'Mark a lead''s reservation fee as paid or unpaid in Billing. Effective only alongside an administrator role.')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."key" IN ('billing.view', 'billing.manage')
  AND r."slug" IN ('super-administrator', 'administrator')
ON CONFLICT DO NOTHING;
