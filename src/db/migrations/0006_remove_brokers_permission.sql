-- The brokers directory pages were removed, but their permission row survives
-- in databases seeded before then: `db:sync-permissions` inserts and grants but
-- never removes, so Settings → Roles & permissions kept listing a key that guards
-- nothing. Role grants go with it (FK ON DELETE CASCADE). Mirrors the
-- `integrations.manage` cleanup in 0005.
DELETE FROM "permissions" WHERE "key" = 'brokers.view';--> statement-breakpoint
