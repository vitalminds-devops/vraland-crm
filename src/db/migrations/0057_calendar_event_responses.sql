-- People invited to an event accept or decline it; a decline keeps their reason.
ALTER TABLE "calendar_event_users" ADD COLUMN IF NOT EXISTS "response_note" text;
ALTER TABLE "calendar_event_users" ADD COLUMN IF NOT EXISTS "responded_at" timestamp with time zone;

-- Calendar and viewing permissions, one per function.
INSERT INTO "permissions" ("key", "module", "description")
VALUES
  ('calendar.assign', 'calendar', 'Invite chosen people to an event. They accept or decline it.'),
  ('calendar.broadcast', 'calendar', 'Invite every active user to an event at once.'),
  ('calendar.edit_others', 'calendar', 'Change or delete events someone else created.'),
  ('calendar.schedule_viewings', 'calendar', 'Schedule property viewings for a contact.'),
  ('calendar.assign_viewings', 'calendar', 'Pick another agent for a viewing, not just yourself.'),
  ('calendar.update_viewings', 'calendar', 'Edit and move viewings, and mark them confirmed, completed, no-show or cancelled.'),
  ('calendar.delete_viewings', 'calendar', 'Remove a viewing that has no outcome on record.')
ON CONFLICT ("key") DO NOTHING;

UPDATE "permissions"
SET "description" = 'Add events, and change or delete the ones you created.'
WHERE "key" = 'calendar.manage';

-- Viewings were part of Manage calendar: every role that had it keeps doing them.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" manage ON manage."id" = rp."permission_id" AND manage."key" = 'calendar.manage'
CROSS JOIN "permissions" p
WHERE p."key" IN ('calendar.schedule_viewings', 'calendar.update_viewings', 'calendar.delete_viewings')
ON CONFLICT DO NOTHING;

-- The rest go to the roles the catalog's defaults give them to.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."is_system" = true
  AND (
    (p."key" IN ('calendar.edit_others', 'calendar.broadcast', 'calendar.assign_viewings')
      AND r."slug" IN ('super-administrator', 'administrator', 'sales-manager', 'master-broker'))
    OR (p."key" = 'calendar.assign'
      AND r."slug" IN ('super-administrator', 'administrator', 'sales-manager', 'master-broker', 'broker'))
  )
ON CONFLICT DO NOTHING;

-- A user given or refused Manage calendar on their own keeps the same for viewings.
INSERT INTO "user_permissions" ("user_id", "permission_key", "granted", "assigned_by")
SELECT up."user_id", k."key", up."granted", up."assigned_by"
FROM "user_permissions" up
CROSS JOIN (
  VALUES ('calendar.schedule_viewings'), ('calendar.update_viewings'), ('calendar.delete_viewings')
) AS k("key")
WHERE up."permission_key" = 'calendar.manage'
ON CONFLICT DO NOTHING;
