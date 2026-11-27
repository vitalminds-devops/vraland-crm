import "../../config/load-environment";
import { unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { Client } from "pg";
import { z } from "zod";

// Empties the sales side of the CRM for a fresh start: every payment, bill, opportunity (the pipeline
// cards) and contact, plus what hangs off them (stage history, tasks, activities, contact notes,
// the calendar events and documents filed against them, and those documents' stored files).
// Kept: pipeline stages, developments, properties and units, users, roles, and the audit log.
// Usage: npm run db:clear-sales-data            (preview, changes nothing)
//        npm run db:clear-sales-data -- --apply
if (process.env.NODE_ENV === "production")
  throw new Error("Clearing sales data is disabled in production.");
const apply = process.argv.includes("--apply");

const { DATABASE_URL } = z.object({ DATABASE_URL: z.string().min(1) }).parse(process.env);
const client = new Client({ connectionString: DATABASE_URL });

// Documents filed against a contact or an opportunity. Deleting a contact only nulls their link, and the
// duplicate-upload check reads every document, so they must go too or the same ID could never be uploaded again.
const linkedDocuments = `contact_id IS NOT NULL OR deal_id IS NOT NULL`;
const linkedEvents = `contact_id IS NOT NULL OR deal_id IS NOT NULL`;

const counts = [
  ["payments", "SELECT count(*) FROM payments"],
  ["bills", "SELECT count(*) FROM bills"],
  ["opportunities (pipeline)", "SELECT count(*) FROM deals"],
  ["contacts", "SELECT count(*) FROM contacts"],
  ["contact/opportunity documents", `SELECT count(*) FROM documents WHERE ${linkedDocuments}`],
  [
    "contact/opportunity calendar events",
    `SELECT count(*) FROM calendar_events WHERE ${linkedEvents}`,
  ],
] as const;

const storageRoot = resolve(process.cwd(), ".data", "documents");

await client.connect();
try {
  for (const [label, query] of counts) {
    const { rows } = await client.query<{ count: string }>(query);
    console.info(`${label}: ${rows[0]?.count ?? 0}`);
  }
  if (!apply) {
    console.info("Preview only. Run again with -- --apply to delete all of the above.");
  } else {
    await client.query("BEGIN");
    // Payments first: bills refuse to be deleted while payments point at them.
    await client.query("DELETE FROM payments");
    await client.query("DELETE FROM bills");
    await client.query(`DELETE FROM calendar_events WHERE ${linkedEvents}`);
    const removed = await client.query<{ storage_key: string }>(
      `DELETE FROM documents WHERE ${linkedDocuments} RETURNING storage_key`,
    );
    // Cascades take stage history, requests, agents, tasks, activities, notes and the like.
    await client.query("DELETE FROM deals");
    await client.query("DELETE FROM contacts");
    await client.query("COMMIT");

    // Files go only after the rows are committed, so a failed run never leaves records without files.
    let missing = 0;
    for (const { storage_key } of removed.rows) {
      const path = resolve(storageRoot, storage_key);
      if (!path.startsWith(`${storageRoot}${sep}`)) continue;
      await unlink(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        missing += 1;
      });
    }
    console.info(
      `Deleted. Removed ${removed.rows.length - missing} stored file(s)${missing ? `; ${missing} were already gone` : ""}.`,
    );
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
