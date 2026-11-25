-- Two things Administrators did by role name are now permissions: skipping property access
-- ("Access all properties") and managing the organization's shared files ("Manage shared files").
-- The Administrator and Super Administrator system roles get both, so nothing changes today;
-- unticking them now takes effect. Safe to run again.
INSERT INTO "permissions" ("key", "module", "description")
VALUES
  ('properties.access_all', 'properties', 'See and change every property without being given property access.'),
  ('documents.manage_shared', 'documents', 'Add and remove the files everyone in the organization can open.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p.key IN ('properties.access_all', 'documents.manage_shared')
WHERE r."is_system" = true
  AND r.slug IN ('administrator', 'super-administrator')
ON CONFLICT DO NOTHING;
