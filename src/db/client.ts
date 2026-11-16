import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
// Fail loudly instead of pg's misleading "client password must be a string".
if (!process.env.DATABASE_URL && process.env.NEXT_PHASE !== "phase-production-build")
  throw new Error(
    "DATABASE_URL is not set. Add it to .env (local) or the stack environment (Portainer).",
  );
const globalDatabase = globalThis as typeof globalThis & { vraPool?: Pool };
const pool =
  globalDatabase.vraPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
// An idle client dropped by Postgres emits "error"; unhandled, it kills the process.
if (!globalDatabase.vraPool)
  pool.on("error", (error) => console.error("Postgres pool error", error));
if (process.env.NODE_ENV !== "production") globalDatabase.vraPool = pool;
export const db = drizzle(pool, { schema });
export type Database = typeof db;
export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
}
