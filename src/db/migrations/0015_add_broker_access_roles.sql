-- New system roles that, for now, have the same access as Broker (see `brokerAccessRoleSlugs`).
-- Added to every organization that has a Broker role, with a copy of Broker's current grants.
INSERT INTO "roles" ("organization_id", "name", "slug", "description", "is_system", "data_scope")
SELECT b."organization_id", r."name", r."slug",
       'Currently has the same access as a Broker: works their own records and can lead agents.',
       true, 'own'
FROM "roles" b
CROSS JOIN (VALUES
  ('License Broker', 'license-broker'),
  ('Network Partner IH', 'network-partner-ih'),
  ('Sales Executive IH', 'sales-executive-ih'),
  ('Sales Executive IND', 'sales-executive-ind'),
  ('Sales Director IH', 'sales-director-ih'),
  ('Consultant IH', 'consultant-ih'),
  ('Sales Executive', 'sales-executive')
) AS r("name", "slug")
WHERE b."slug" = 'broker'
ON CONFLICT ("organization_id", "slug") DO NOTHING;--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT n."id", rp."permission_id"
FROM "roles" b
JOIN "role_permissions" rp ON rp."role_id" = b."id"
JOIN "roles" n
  ON n."organization_id" = b."organization_id"
 AND n."slug" IN ('license-broker', 'network-partner-ih', 'sales-executive-ih', 'sales-executive-ind',
                  'sales-director-ih', 'consultant-ih', 'sales-executive')
WHERE b."slug" = 'broker'
ON CONFLICT DO NOTHING;
