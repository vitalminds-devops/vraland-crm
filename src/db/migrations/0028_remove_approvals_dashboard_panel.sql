-- Stage approvals moved off the dashboard to Sales Pipeline -> Approvals; drop the panel's permission.
DELETE FROM "role_permissions"
WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" = 'dashboard.view_approvals');--> statement-breakpoint
DELETE FROM "permissions" WHERE "key" = 'dashboard.view_approvals';
