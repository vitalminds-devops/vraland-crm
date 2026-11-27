import "../../config/load-environment";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Client } from "pg";
import { z } from "zod";

const { DATABASE_URL } = z.object({ DATABASE_URL: z.string().min(1) }).parse(process.env);
const migrationsDirectory = resolve(process.cwd(), "src/db/migrations");
const client = new Client({ connectionString: DATABASE_URL });

// A database built with db:push (or restored) has a schema but no history. Every migration from 0005 on is
// written to be re-runnable, so those simply run; these older ones are not, so each is recorded instead of run
// when the database already shows its effect. New migrations must stay re-runnable (IF NOT EXISTS, ON CONFLICT).
const alreadyApplied: Record<string, string> = {
  "0000_gray_ultimo.sql": "SELECT to_regclass('public.users') IS NOT NULL AS applied",
  "0001_jittery_shotgun.sql":
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'cover_image_storage_key') AS applied",
  "0002_low_callisto.sql":
    "SELECT to_regclass('public.audit_logs_org_occurred_at_idx') IS NOT NULL AS applied",
  "0003_careful_jubilee.sql": "SELECT to_regclass('public.integrations') IS NULL AS applied",
  "0004_dazzling_guardsmen.sql":
    "SELECT to_regclass('public.integration_sync_logs') IS NULL AS applied",
  // These copy the old property prices down; a schema without those columns (0082) has none to copy.
  "0061_unit_prices_from_property.sql":
    "SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'asking_price') AS applied",
  "0069_prices_on_types.sql":
    "SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'monthly_rent') AS applied",
};

await client.connect();
try {
  // A new, empty database needs it before the first migration; existing ones already have it.
  await client.query("CREATE EXTENSION IF NOT EXISTS citext");
  await client.query(
    "CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  );
  await client.query("ALTER TABLE app_migrations ADD COLUMN IF NOT EXISTS checksum TEXT");
  const history = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM app_migrations",
  );
  const schemaExists = await client.query<{ exists: boolean }>(
    "SELECT to_regclass('public.users') IS NOT NULL AS exists",
  );
  const adopting = history.rows[0]?.count === 0 && schemaExists.rows[0]?.exists === true;
  if (adopting)
    console.info(
      "No migration history, but the schema exists: recording what it already has, then running the rest.",
    );
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(resolve(migrationsDirectory, file), "utf8");
    const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
    const applied = await client.query<{ checksum: string | null }>(
      "SELECT checksum FROM app_migrations WHERE name = $1",
      [file],
    );
    const recorded = applied.rows[0];
    if (recorded) {
      if (recorded.checksum && recorded.checksum !== checksum) {
        throw new Error(
          `${file} changed after it was applied. Add a new migration instead of editing an applied one.`,
        );
      }
      continue;
    }
    const guard = adopting ? alreadyApplied[file] : undefined;
    if (guard && (await client.query<{ applied: boolean }>(guard)).rows[0]?.applied) {
      await client.query("INSERT INTO app_migrations(name, checksum) VALUES ($1, $2)", [
        file,
        checksum,
      ]);
      console.info(`Recorded ${file} (already in the database)`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO app_migrations(name, checksum) VALUES ($1, $2)", [
        file,
        checksum,
      ]);
      await client.query("COMMIT");
      console.info(`Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
