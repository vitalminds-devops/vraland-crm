INSERT INTO roles (organization_id,name,slug,description,is_system,data_scope)
SELECT organization_id,'Network Partner IND','network-partner-ind',description,true,data_scope FROM roles WHERE slug='network-partner-ih' ON CONFLICT (organization_id,slug) DO NOTHING;
INSERT INTO role_permissions (role_id,permission_id)
SELECT target.id,rp.permission_id FROM roles source JOIN role_permissions rp ON rp.role_id=source.id JOIN roles target ON target.organization_id=source.organization_id AND target.slug='network-partner-ind' WHERE source.slug='network-partner-ih' ON CONFLICT DO NOTHING;
