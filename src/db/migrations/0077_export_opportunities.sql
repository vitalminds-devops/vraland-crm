-- Exporting opportunities (with their amounts) gets its own permission, like contacts. Every role
-- that can view opportunities today keeps exporting them, and a user given or refused View sales
-- pipeline on their own gets the same for export. Safe to run again.
INSERT INTO "permissions" ("key", "module", "description")
VALUES ('deals.export', 'deals', 'Download opportunities, with their amounts, as a CSV file.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" v ON v."id" = rp."permission_id" AND v."key" = 'deals.view'
CROSS JOIN "permissions" p
WHERE p."key" = 'deals.export'
ON CONFLICT DO NOTHING;

INSERT INTO "user_permissions" ("user_id", "permission_key", "granted", "assigned_by")
SELECT up."user_id", 'deals.export', up."granted", up."assigned_by"
FROM "user_permissions" up
WHERE up."permission_key" = 'deals.view'
ON CONFLICT DO NOTHING;
