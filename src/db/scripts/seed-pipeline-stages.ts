import "../../config/load-environment";
import { count, eq } from "drizzle-orm";

import { closeDatabaseConnection, db } from "../client";
import { organizations, pipelineStages } from "../schema";
import { seedPipelineStages } from "../seeds/pipeline-stages";

// Adds the default sales pipeline stages to an existing organization and nothing else.
// Usage: npm run db:seed:stages -- [ORGANIZATION_CODE]  (code optional when only one organization exists)
const code = process.argv[2];

try {
  const orgs = await db
    .select({ id: organizations.id, code: organizations.code })
    .from(organizations)
    .where(code ? eq(organizations.code, code) : undefined);

  if (orgs.length !== 1) {
    const all = await db.select({ code: organizations.code }).from(organizations);
    throw new Error(
      `${code ? `No organization with code "${code}".` : "More than one organization exists."} Pass one of: ${all.map((o) => o.code).join(", ")}`,
    );
  }
  const [organization] = orgs;

  const [existing] = await db
    .select({ value: count() })
    .from(pipelineStages)
    .where(eq(pipelineStages.organizationId, organization.id));
  // Never overwrite stages an organization already has.
  if (existing.value > 0) {
    console.info(
      `${organization.code} already has ${existing.value} pipeline stage(s); nothing changed.`,
    );
  } else {
    await db.transaction((tx) => seedPipelineStages(tx, organization.id));
    console.info(`Pipeline stages added to ${organization.code}.`);
  }
} finally {
  await closeDatabaseConnection();
}
