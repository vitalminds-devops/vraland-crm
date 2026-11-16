import "../../config/load-environment";
import { Client } from "pg";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();

  const result = await client.query(`
    UPDATE contacts
    SET broker_user_id = contacts.assigned_user_id,
        updated_at = NOW()
    FROM users
    INNER JOIN user_roles ON users.id = user_roles.user_id
    INNER JOIN roles ON user_roles.role_id = roles.id
    WHERE contacts.assigned_user_id = users.id
      AND contacts.broker_user_id IS NULL
      AND users.organization_id = contacts.organization_id
      AND users.deleted_at IS NULL
      AND lower(roles.slug) = 'broker'
    RETURNING contacts.id, contacts.contact_code;
  `);

  console.log(`Updated ${result.rowCount} contacts where the assigned user is a broker`);
  console.log("Brokers should now be able to see their own contacts.");
} finally {
  await client.end();
}
