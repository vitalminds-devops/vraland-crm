import "../../config/load-environment";
import { Client } from "pg";
import { z } from "zod";

if (process.env.NODE_ENV === "production")
  throw new Error("Database reset is disabled in production.");

const { DATABASE_URL } = z.object({ DATABASE_URL: z.string().min(1) }).parse(process.env);
// NODE_ENV is usually unset on a workstation, so also refuse any non-local host.
const { hostname } = new URL(DATABASE_URL);
if (
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname) &&
  process.env.ALLOW_DATABASE_RESET !== "true"
)
  throw new Error(
    `Refusing to reset ${hostname}. Set ALLOW_DATABASE_RESET=true if this really is a disposable database.`,
  );
const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
  console.info("Public schema reset. Run `npm run db:migrate` then `npm run db:seed`.");
} finally {
  await client.end();
}
