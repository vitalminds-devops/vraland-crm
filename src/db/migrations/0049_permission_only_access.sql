-- Access now follows permissions alone, with no administrator-role shortcuts. Grant what those shortcuts gave,
-- so nobody loses access:
--   * "Move opportunities back" to Super Administrator, Administrator and Master Broker.
--   * "View billing" to the broker-type roles, which saw their opportunities' bills through "View opportunities".
-- Re-runnable: grants that already exist are left alone.

INSERT INTO permissions (key, module, description) VALUES
  ('deals.move_back', 'deals', 'Move an opportunity to an earlier stage.'),
  ('billing.view', 'billing', 'See the bills of opportunities in their data access.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key = 'deals.move_back'
WHERE r.slug IN ('super-administrator', 'administrator', 'master-broker')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key = 'billing.view'
WHERE r.slug IN ('broker', 'license-broker', 'network-partner-ih', 'network-partner-ind',
  'sales-executive-ih', 'sales-executive-ind', 'sales-director-ih', 'consultant-ih', 'sales-executive')
ON CONFLICT DO NOTHING;
