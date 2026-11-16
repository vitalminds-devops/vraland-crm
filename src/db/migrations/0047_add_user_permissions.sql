-- Per-user permission changes on top of the user's roles. Re-runnable: IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key varchar(150) NOT NULL,
  granted boolean NOT NULL,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, permission_key)
);
