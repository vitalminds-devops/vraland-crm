import "../../config/load-environment";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db, closeDatabaseConnection } from "../client";
import { organizations, roles, users, userRoles, authUser, authAccount } from "../schema";

if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEVELOPMENT_SEED !== "true")
  throw new Error(
    "Executive test seed requires ALLOW_DEVELOPMENT_SEED=true and a non-production environment.",
  );
const code = process.env.ORGANIZATION_CODE;
const password = process.env.DEV_SEED_PASSWORD;
if (!code || !password || password.length < 12 || password.length > 128)
  throw new Error("Set ORGANIZATION_CODE and DEV_SEED_PASSWORD (12 to 128 characters).");
const passwordHash = await hashPassword(password);
try {
  await db.transaction(async (tx) => {
    const [organization] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.code, code));
    if (!organization) throw new Error("Organization not found; no data was inserted.");
    for (const slug of ["sales-executive", "sales-executive-ih", "sales-executive-ind"]) {
      const [role] = await tx
        .select()
        .from(roles)
        .where(and(eq(roles.organizationId, organization.id), eq(roles.slug, slug)));
      if (!role) throw new Error(`Missing role: ${slug}. Apply role migrations first.`);
      for (let sample = 1; sample <= 3; sample++) {
        const email = `${slug}-${sample}.${code.toLowerCase()}@dev.example.com`;
        const personName = { firstName: role.name, lastName: `Test ${sample}` };
        const [crmUser] = await tx
          .insert(users)
          .values({
            organizationId: organization.id,
            email,
            firstName: personName.firstName,
            lastName: personName.lastName,
            status: "active",
            emailVerifiedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [users.organizationId, users.email],
            set: {
              firstName: personName.firstName,
              lastName: personName.lastName,
              status: "active",
              deletedAt: null,
            },
          })
          .returning();
        await tx
          .insert(userRoles)
          .values({ userId: crmUser.id, roleId: role.id })
          .onConflictDoNothing();

        const [existingIdentity] = await tx
          .select({ id: authUser.id })
          .from(authUser)
          .where(eq(authUser.email, email))
          .limit(1);
        const identityId = existingIdentity?.id ?? randomUUID();
        if (existingIdentity)
          await tx
            .update(authUser)
            .set({
              crmUserId: crmUser.id,
              name: `${personName.firstName} ${personName.lastName}`,
              emailVerified: true,
              updatedAt: new Date(),
            })
            .where(eq(authUser.id, identityId));
        else
          await tx.insert(authUser).values({
            id: identityId,
            crmUserId: crmUser.id,
            name: `${personName.firstName} ${personName.lastName}`,
            email,
            emailVerified: true,
          });

        const [existingAccount] = await tx
          .select({ id: authAccount.id })
          .from(authAccount)
          .where(and(eq(authAccount.userId, identityId), eq(authAccount.providerId, "credential")))
          .limit(1);
        if (existingAccount)
          await tx
            .update(authAccount)
            .set({ password: passwordHash, updatedAt: new Date() })
            .where(eq(authAccount.id, existingAccount.id));
        else
          await tx.insert(authAccount).values({
            id: randomUUID(),
            issuer: "local:credential",
            accountId: identityId,
            providerId: "credential",
            userId: identityId,
            password: passwordHash,
          });
      }
    }
  });
  console.info(
    `Seeded 9 executive test accounts in ${code}. Emails: <role>-<1..3>.${code.toLowerCase()}@dev.example.com. Existing team assignments were preserved.`,
  );
} finally {
  await closeDatabaseConnection();
}
