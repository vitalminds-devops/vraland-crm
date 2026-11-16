import "../../config/load-environment";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Client } from "pg";
import { z } from "zod";

import { findMissingColumns, type ExpectedTable } from "./schema-drift";

const { DATABASE_URL } = z.object({ DATABASE_URL: z.string().min(1) }).parse(process.env);
const migrationsDirectory = resolve(process.cwd(), "src/db/migrations");

const journal = JSON.parse(
  await readFile(resolve(migrationsDirectory, "meta/_journal.json"), "utf8"),
) as { entries: { tag: string }[] };
const latest = journal.entries[journal.entries.length - 1];
if (!latest) throw new Error("No migrations found in src/db/migrations/meta.");

const snapshot = JSON.parse(
  await readFile(resolve(migrationsDirectory, `meta/${latest.tag}_snapshot.json`), "utf8"),
) as {
  tables: Record<string, { columns: Record<string, { name: string }> }>;
};

const expected: ExpectedTable[] = Object.entries(snapshot.tables).map(([table, definition]) => ({
  table,
  columns: Object.values(definition.columns).map((column) => column.name),
}));

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const live = await client.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
  }>(
    "SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog', 'information_schema')",
  );

  const actual = new Map<string, Set<string>>();
  for (const row of live.rows) {
    const table = `${row.table_schema}.${row.table_name}`;
    const columns = actual.get(table) ?? new Set<string>();
    columns.add(row.column_name);
    actual.set(table, columns);
  }

  const missing = findMissingColumns(expected, actual);
  if (missing.length > 0) {
    console.error(
      `Database is missing ${missing.length} column(s)/table(s) the code expects:\n${missing
        .map((entry) => `  ${entry}`)
        .join("\n")}\nRun \`npm run db:migrate\` before deploying this build.`,
    );
    process.exitCode = 1;
  } else {
    console.info(`Database matches ${latest.tag}: ${expected.length} tables checked.`);
  }
} finally {
  await client.end();
}
