-- "Approve contacts" (contacts.approve) and "Manage settings" (settings.manage) were never checked by any page,
-- action or query, so granting them did nothing. They are gone from the catalog; drop them from the database too.
-- role_permissions rows go with the permissions rows (ON DELETE CASCADE); user_permissions stores the key, so
-- delete those rows explicitly. Re-runnable: deleting rows that are already gone does nothing.
DELETE FROM "user_permissions" WHERE "permission_key" IN ('contacts.approve', 'settings.manage');--> statement-breakpoint
DELETE FROM "permissions" WHERE "key" IN ('contacts.approve', 'settings.manage');
