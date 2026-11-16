-- Brokers (and the roles sharing Broker's access) may add agents to their own team.
INSERT INTO "permissions" ("key", "module", "description")
VALUES (
  'users.add_own_agents',
  'users',
  'Open Settings → My agents and create Agent accounts that report to this user. The new agent is always assigned to whoever creates it.'
)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."key" = 'users.add_own_agents'
  AND r."slug" IN ('broker', 'license-broker', 'network-partner-ih', 'sales-executive-ih',
                   'sales-executive-ind', 'sales-director-ih', 'consultant-ih', 'sales-executive')
ON CONFLICT DO NOTHING;
