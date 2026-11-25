-- Prices and fees get their own permission, "Manage prices". Every role that can manage floors,
-- units and parking today (built-in or custom) keeps setting them, and a user given or refused
-- that permission on their own gets the same for prices. Safe to run again.
INSERT INTO "permissions" ("key", "module", "description")
VALUES (
  'properties.manage_prices',
  'properties',
  'Set prices, reservation fees and monthly amortization on unit and parking types, units and parking slots.'
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" units ON units."id" = rp."permission_id" AND units."key" = 'properties.manage_units'
CROSS JOIN "permissions" p
WHERE p."key" = 'properties.manage_prices'
ON CONFLICT DO NOTHING;

INSERT INTO "user_permissions" ("user_id", "permission_key", "granted", "assigned_by")
SELECT up."user_id", 'properties.manage_prices', up."granted", up."assigned_by"
FROM "user_permissions" up
WHERE up."permission_key" = 'properties.manage_units'
ON CONFLICT DO NOTHING;
