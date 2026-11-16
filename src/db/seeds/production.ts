import "../../config/load-environment";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { closeDatabaseConnection, db } from "../client";
import { users } from "../schema";
import { seedReferenceData } from "./reference";

const input = z
  .object({
    ORGANIZATION_CODE: z.string().min(1).max(50).default("CRM-PROD"),
    ORGANIZATION_NAME: z.string().min(1).max(180).optional(),
  })
  .parse(process.env);

const organizationName = input.ORGANIZATION_NAME ?? `Real Estate CRM (${input.ORGANIZATION_CODE})`;

const summary = await db.transaction(async (tx) => {
  const { organization, rolesBySlug } = await seedReferenceData(tx, {
    organizationName,
    organizationCode: input.ORGANIZATION_CODE,
  });

  const [existing] = await tx
    .select({ value: count() })
    .from(users)
    .where(eq(users.organizationId, organization.id));

  return {
    organization,
    roleCount: Object.keys(rolesBySlug).length,
    userCount: existing?.value ?? 0,
  };
});

console.info(
  [
    `Reference data seeded for ${summary.organization.name} (${summary.organization.code}).`,
    `  system roles: ${summary.roleCount}, with their catalogue grants`,
    `  accounts:     ${summary.userCount}`,
    summary.userCount === 0
      ? "  next:         npm run auth:provision-admin"
      : "  (accounts already exist; nothing was created or changed for them)",
  ].join("\n"),
);

await closeDatabaseConnection();
