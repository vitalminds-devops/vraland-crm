import nextEnvironment from "@next/env";
import { Client } from "pg";
import { permissionKeys } from "../../src/lib/permissions/catalog";

/** The database DATABASE_URL names, when it is a test database (its name ends in "_test"); else null. */
export function testDatabaseName(databaseUrl: string | undefined): string | null {
  let url: URL;
  try {
    url = new URL(databaseUrl ?? "");
  } catch {
    return null;
  }
  const name = decodeURIComponent(url.pathname.slice(1));
  return /^[A-Za-z0-9_]+_test$/.test(name) ? name : null;
}

export async function verifyConnectedDatabase(client: Client) {
  const { rows } = await client.query(
    "select current_database() as name, to_regclass('public.users')::text as users",
  );
  // A missing or non-test DATABASE_URL compares as null and fails closed.
  if (rows[0]?.name !== testDatabaseName(process.env.DATABASE_URL) || !rows[0]?.users)
    throw new Error("Database identity/schema mismatch; no mutations permitted");
}

export async function verifyDatabase() {
  nextEnvironment.loadEnvConfig(process.cwd());
  if (!process.env.DATABASE_URL || !URL.canParse(process.env.DATABASE_URL))
    throw new Error("DATABASE_URL is missing or invalid; refusing test execution");
  // Tests create and delete rows, so only a database named like `vra_test` may be used.
  if (!testDatabaseName(process.env.DATABASE_URL))
    throw new Error("Refusing a database whose name does not end in _test");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    await verifyConnectedDatabase(client);
    const permissions = await client.query(
      "select key from permissions where key=any($1::text[])",
      [permissionKeys],
    );
    if (permissions.rowCount !== permissionKeys.length)
      throw new Error("Test database lacks required permission catalog; provision separately");
  } finally {
    await client.end();
  }
}
