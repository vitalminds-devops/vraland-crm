-- Administrators hold every catalog permission; without this one they cannot grant it to other roles in Roles & permissions.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."key" = 'users.add_own_agents'
  AND r."slug" IN ('super-administrator', 'administrator')
ON CONFLICT DO NOTHING;
