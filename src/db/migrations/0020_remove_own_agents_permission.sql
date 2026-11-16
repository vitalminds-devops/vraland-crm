-- Brokers no longer add their own agents; administrators create every Agent account.
DELETE FROM "role_permissions"
WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" = 'users.add_own_agents');--> statement-breakpoint
DELETE FROM "permissions" WHERE "key" = 'users.add_own_agents';
