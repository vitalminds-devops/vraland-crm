import "../../config/load-environment";
import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { closeDatabaseConnection, db } from "../client";
import { authAccount, authUser, organizations, roles, userRoles, users } from "../schema";

const input = z
  .object({
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(12).max(128),
    ADMIN_FIRST_NAME: z.string().min(1).max(120),
    ADMIN_LAST_NAME: z.string().min(1).max(120),
    ORGANIZATION_CODE: z.string().min(1).default("CRM-PROD"),
  })
  .parse(process.env);

await db.transaction(async (tx) => {
  const [organization] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.code, input.ORGANIZATION_CODE))
    .limit(1);
  if (!organization)
    throw new Error(
      `Organization ${input.ORGANIZATION_CODE} does not exist. Apply the baseline and seed reference data first.`,
    );
  const [role] = await tx
    .select()
    .from(roles)
    .where(and(eq(roles.organizationId, organization.id), eq(roles.slug, "super-administrator")))
    .limit(1);
  if (!role) throw new Error("The organization has no seeded role.");

  const email = input.ADMIN_EMAIL.toLowerCase();
  const existing = await tx
    .select({ id: authUser.id })
    .from(authUser)
    .where(eq(authUser.email, email))
    .limit(1);
  if (existing.length) throw new Error("An authentication identity already exists for this email.");

  const [crmUser] = await tx
    .insert(users)
    .values({
      organizationId: organization.id,
      email,
      firstName: input.ADMIN_FIRST_NAME,
      lastName: input.ADMIN_LAST_NAME,
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .returning();
  await tx.insert(userRoles).values({ userId: crmUser.id, roleId: role.id });
  const identityId = randomUUID();
  await tx.insert(authUser).values({
    id: identityId,
    crmUserId: crmUser.id,
    name: `${input.ADMIN_FIRST_NAME} ${input.ADMIN_LAST_NAME}`,
    email,
    emailVerified: true,
  });
  await tx.insert(authAccount).values({
    id: randomUUID(),
    issuer: "local:credential",
    accountId: identityId,
    providerId: "credential",
    userId: identityId,
    password: await hashPassword(input.ADMIN_PASSWORD),
  });
});

console.info(
  "Administrator identity provisioned. Remove bootstrap variables from your environment now.",
);
await closeDatabaseConnection();
