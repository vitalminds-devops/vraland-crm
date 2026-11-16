-- Data access becomes three permissions: records.view_own, records.view_team, records.view_all.
-- Each role gets the one matching the scope it had (catalog default for built-in roles, else roles.data_scope,
-- else the organization), and each per-user override becomes user_permissions rows with the same effect.
-- users.data_scope_override and roles.data_scope are left as they were, as a record of the old values.
-- Re-runnable: a role or user that already has any records.* row is skipped.

INSERT INTO permissions (key, module, description) VALUES
  ('records.view_own', 'records', 'Records they created or are assigned.'),
  ('records.view_team', 'records', 'Their records plus their agents''.'),
  ('records.view_all', 'records', 'Every record in the organization.')
ON CONFLICT (key) DO NOTHING;

WITH role_scope AS (
  SELECT r.id,
    CASE
      WHEN r.slug IN ('super-administrator', 'administrator', 'sales-manager', 'master-broker', 'viewer')
        THEN 'organization'
      WHEN r.slug IN ('broker', 'license-broker', 'network-partner-ih', 'network-partner-ind',
        'sales-executive-ih', 'sales-executive-ind', 'sales-director-ih', 'consultant-ih', 'sales-executive')
        THEN 'broker_team'
      WHEN r.slug IN ('agent')
        THEN 'own'
      WHEN r.data_scope IN ('own', 'broker_team', 'organization') THEN r.data_scope
      ELSE 'organization'
    END AS scope
  FROM roles r
  WHERE NOT EXISTS (
    SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = r.id AND p.key LIKE 'records.%'
  )
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT rs.id, p.id
FROM role_scope rs
JOIN permissions p ON p.key = CASE rs.scope
  WHEN 'own' THEN 'records.view_own'
  WHEN 'broker_team' THEN 'records.view_team'
  ELSE 'records.view_all'
END
ON CONFLICT DO NOTHING;

-- An override set the user's scope outright, so: grant its key unless a role already gives it, and remove
-- every broader key a role gives. Administrators always see everything, so their overrides never applied.
WITH overridden AS (
  SELECT u.id,
    CASE u.data_scope_override
      WHEN 'own' THEN 'records.view_own'
      WHEN 'broker_team' THEN 'records.view_team'
      ELSE 'records.view_all'
    END AS target
  FROM users u
  WHERE u.data_scope_override IN ('own', 'broker_team', 'organization')
    AND NOT EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id AND r.slug IN ('super-administrator', 'administrator')
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_permissions up
      WHERE up.user_id = u.id AND up.permission_key LIKE 'records.%'
    )
),
candidate AS (
  SELECT o.id, k.key, o.target,
    array_position(ARRAY['records.view_own', 'records.view_team', 'records.view_all'], k.key) AS key_rank,
    array_position(ARRAY['records.view_own', 'records.view_team', 'records.view_all'], o.target) AS target_rank,
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = o.id AND p.key = k.key
    ) AS from_role
  FROM overridden o
  CROSS JOIN (VALUES ('records.view_own'), ('records.view_team'), ('records.view_all')) AS k(key)
)
INSERT INTO user_permissions (user_id, permission_key, granted)
SELECT id, key, key = target
FROM candidate
WHERE (key = target AND NOT from_role) OR (key_rank > target_rank AND from_role)
ON CONFLICT DO NOTHING;
