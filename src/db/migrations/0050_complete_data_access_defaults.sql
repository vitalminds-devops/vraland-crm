-- Migration 0048 gave each existing role only its broadest data access permission; a new database gives the
-- catalog defaults, which also include the narrower ones (a Broker has "See own records" and "See team records").
-- Add the missing narrower ones so existing and new databases show the same ticks. Access does not change: the
-- broadest permission held applies. A role is only touched while it still holds its default broadest permission,
-- so a role an administrator narrowed is never widened. Re-runnable: grants that already exist are left alone.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key = 'records.view_own'
WHERE r.slug IN ('broker', 'license-broker', 'network-partner-ih', 'network-partner-ind',
    'sales-executive-ih', 'sales-executive-ind', 'sales-director-ih', 'consultant-ih', 'sales-executive')
  AND EXISTS (
    SELECT 1 FROM role_permissions rp JOIN permissions held ON held.id = rp.permission_id
    WHERE rp.role_id = r.id AND held.key = 'records.view_team'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key IN ('records.view_own', 'records.view_team')
WHERE r.slug IN ('super-administrator', 'administrator', 'sales-manager', 'master-broker')
  AND EXISTS (
    SELECT 1 FROM role_permissions rp JOIN permissions held ON held.id = rp.permission_id
    WHERE rp.role_id = r.id AND held.key = 'records.view_all'
  )
ON CONFLICT DO NOTHING;
