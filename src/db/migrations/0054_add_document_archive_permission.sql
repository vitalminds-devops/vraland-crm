INSERT INTO "permissions" ("key", "module", "description")
VALUES ('documents.archive', 'documents', 'Open Archive, archive documents and restore archived documents.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."key" = 'documents.archive'
  AND r."is_system" = true
  AND r."slug" IN ('super-administrator', 'administrator')
ON CONFLICT DO NOTHING;
