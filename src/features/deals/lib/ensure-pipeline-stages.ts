import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { pipelineStages } from "@/db/schema";
import { defaultPipelineStages, seedPipelineStages } from "@/db/seeds/pipeline-stages";

// The stage list only changes with a deploy, so an organization checked once needs no second check.
const inStep = new Set<string>();

/**
 * Adds any of `defaultPipelineStages` the organization is missing (or has switched off), so no seed
 * has to be run. Stages that are all present are left exactly as they are.
 */
export async function ensurePipelineStages(organizationId: string) {
  if (inStep.has(organizationId)) return;
  const rows = await db
    .select({ slug: pipelineStages.slug, isActive: pipelineStages.isActive })
    .from(pipelineStages)
    .where(eq(pipelineStages.organizationId, organizationId));
  const complete = defaultPipelineStages.every((stage) =>
    rows.some((row) => row.slug === stage.slug && row.isActive),
  );
  if (!complete)
    await db.transaction(async (tx) => {
      // Two first requests at once must not both rewrite the stage positions.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${organizationId}))`);
      await seedPipelineStages(tx, organizationId);
    });
  inStep.add(organizationId);
}
