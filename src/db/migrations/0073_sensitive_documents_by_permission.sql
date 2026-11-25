-- "View sensitive documents" now decides alone who reads sensitive documents. Sales Manager,
-- Administrator and Super Administrator used to read them by role name, so their system roles
-- get the permission to keep that access; unticking it afterwards now takes effect. Safe to run again.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p.key = 'documents.view_sensitive'
WHERE r."is_system" = true
  AND r.slug IN ('sales-manager', 'administrator', 'super-administrator')
ON CONFLICT DO NOTHING;
