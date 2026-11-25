-- 0057 gave "Invite others to events" only to Broker. Every broker-type role has it in the catalog,
-- so older databases now match new ones. Safe to run again.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p.key = 'calendar.assign'
WHERE r."is_system" = true
  AND r.slug IN ('broker', 'license-broker', 'network-partner-ih', 'network-partner-ind', 'sales-executive-ih', 'sales-executive-ind', 'sales-director-ih', 'consultant-ih', 'sales-executive')
ON CONFLICT DO NOTHING;
