DROP TABLE "integration_sync_logs" CASCADE;--> statement-breakpoint
-- `settings.logs` existed only for the sync-log screen. `db:sync-permissions`
-- inserts and grants but never removes, so without this the permission row (and
-- its grants to administrator/super-administrator) would survive in the
-- database while no longer existing in the catalog, and Settings → Roles would
-- list a key that grants nothing. The role grants go with it: the FK is
-- ON DELETE CASCADE.
DELETE FROM "permissions" WHERE "key" = 'settings.logs';