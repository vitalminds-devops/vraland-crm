import "../../config/load-environment";

import { Client } from "pg";
import { z } from "zod";

const { DATABASE_URL } = z.object({ DATABASE_URL: z.string().min(1) }).parse(process.env);
const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  await client.query("CREATE EXTENSION IF NOT EXISTS citext");
  console.info("PostgreSQL citext extension is available.");
} finally {
  await client.end();
}
