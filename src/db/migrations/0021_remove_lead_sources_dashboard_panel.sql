-- The lead-source dashboard panel is gone with the Referral Source field; drop its permission.
DELETE FROM "role_permissions"
WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" = 'dashboard.view_lead_sources');--> statement-breakpoint
DELETE FROM "permissions" WHERE "key" = 'dashboard.view_lead_sources';
