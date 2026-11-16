-- The integrations feature was removed from the schema (0003 and 0004), but its
-- permission row survived in databases seeded before then: `db:sync-permissions`
-- inserts and grants but never removes, so Settings → Roles & permissions kept
-- listing a key that guards nothing. Role grants go with it (FK ON DELETE
-- CASCADE). Mirrors the `settings.logs` cleanup in 0004.
DELETE FROM "permissions" WHERE "key" = 'integrations.manage';--> statement-breakpoint
