import "../../config/load-environment";
import { count, eq } from "drizzle-orm";
import { closeDatabaseConnection, db } from "../client";
import { authAccount, authUser, organizations, users } from "../schema";

try {
  const [[organizationCount], [userCount], [identityCount], [credentialCount]] = await Promise.all([
    db.select({ value: count() }).from(organizations),
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(authUser),
    db.select({ value: count() }).from(authAccount).where(eq(authAccount.providerId, "credential")),
  ]);
  console.info(
    `PostgreSQL connected: ${organizationCount.value} organization(s), ${userCount.value} CRM user(s), ${identityCount.value} auth identity record(s), ${credentialCount.value} credential account(s).`,
  );
} finally {
  await closeDatabaseConnection();
}
