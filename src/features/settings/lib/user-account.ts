import "server-only";

import { randomUUID } from "node:crypto";
import type { db } from "@/db";
import { auditLogs, authAccount, authUser, documents, userRoles, users } from "@/db/schema";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type StoredOnboardingFile = {
  name: string;
  storageKey: string;
  mimeType: string;
  size: number;
  checksum: string;
};

export function onboardingDocumentValues(
  organizationId: string,
  createdBy: string,
  userId: string,
  files: StoredOnboardingFile[],
) {
  return files.map((file) => ({
    organizationId,
    userId,
    name: file.name,
    category: "other",
    status: "draft",
    storageKey: file.storageKey,
    mimeType: file.mimeType,
    fileSizeBytes: file.size,
    checksumSha256: file.checksum,
    createdBy,
  }));
}

/**
 * Creates an active user who signs in with a password: the CRM user, the sign-in identity and
 * credential, the roles, and any onboarding documents (each audited). Returns the new user's id.
 */
export async function insertUserAccount(
  tx: DbTransaction,
  actor: { organizationId: string; userId: string },
  account: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null | undefined;
    brokerId: string | null | undefined;
    passwordHash: string;
    roleIds: string[];
    files: StoredOnboardingFile[];
  },
): Promise<string> {
  const email = account.email.toLowerCase();
  const [user] = await tx
    .insert(users)
    .values({
      organizationId: actor.organizationId,
      brokerId: account.brokerId || null,
      email,
      firstName: account.firstName,
      lastName: account.lastName,
      phone: account.phone || null,
      status: "active",
    })
    .returning({ id: users.id });
  const identityId = randomUUID();
  await tx.insert(authUser).values({
    id: identityId,
    crmUserId: user.id,
    name: `${account.firstName} ${account.lastName}`,
    email,
    emailVerified: false,
  });
  await tx.insert(authAccount).values({
    id: randomUUID(),
    issuer: "local:credential",
    accountId: identityId,
    providerId: "credential",
    userId: identityId,
    password: account.passwordHash,
  });
  await tx
    .insert(userRoles)
    .values(
      account.roleIds.map((roleId) => ({ userId: user.id, roleId, assignedBy: actor.userId })),
    );
  if (account.files.length) {
    const uploaded = await tx
      .insert(documents)
      .values(onboardingDocumentValues(actor.organizationId, actor.userId, user.id, account.files))
      .returning({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        fileSizeBytes: documents.fileSizeBytes,
        checksumSha256: documents.checksumSha256,
      });
    await tx.insert(auditLogs).values(
      uploaded.map((document) => ({
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "create",
        entityType: "document",
        entityId: document.id,
        newValues: {
          name: document.name,
          mimeType: document.mimeType,
          fileSize: document.fileSizeBytes,
          checksum: document.checksumSha256,
          userId: user.id,
        },
      })),
    );
  }
  return user.id;
}
