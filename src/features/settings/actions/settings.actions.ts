"use server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { HandoverError, handOverWork } from "../lib/user-handover";
import { staleBrokerChange } from "../lib/user-restore";
import {
  allowsTeamMember,
  assignedBrokerRoles,
  reportsToMasterBroker,
  teamMemberRoles,
} from "@/lib/permissions/team-assignment";
import {
  agents,
  authAccount,
  authSession,
  authUser,
  auditLogs,
  commissionLinks,
  documents,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import {
  canAssignRoles,
  canChangeUser,
  requireAuthorizationContext,
  requirePermission,
} from "@/lib/permissions/authorization";
import {
  administratorRoleSlug,
  agentRoleSlug,
  brokerIdTargetRoleSlugs,
  isAgentRoleSlug,
  isPermissionKey,
  permissionModule,
  masterBrokerRoleSlug,
  permissionMetadata,
  superAdministratorRoleSlug,
} from "@/lib/permissions/catalog";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { documentFileError, documentFileTypes } from "@/lib/storage/document-validation";
import { createHash, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { canManageUsers, hasPermission } from "@/lib/permissions/policy";
import { logError } from "@/lib/logger";
import { buildChangeSet, isEmptyChangeSet } from "@/lib/audit/redact";
import {
  type ActionResult,
  databaseFailure,
  failure,
  failureFrom,
  success,
  validationFailure,
  validationFailureFromZod,
} from "@/lib/types/action-result";
import { ActionErrorCode, permissionDenied } from "@/lib/errors";
import {
  checkPermissionOverrides,
  permissionOverridesSchema,
  writePermissionOverrides,
} from "./user-permission-writes";

export type SettingsResult = ActionResult<{ id: string }>;
const refresh = (path: string) => {
  revalidatePath("/settings");
  revalidatePath("/settings/users/organization-chart");
  revalidatePath(path);
};

async function revokeUserSessions(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  crmUserId: string,
) {
  await tx
    .delete(authSession)
    .where(
      inArray(
        authSession.userId,
        tx.select({ id: authUser.id }).from(authUser).where(eq(authUser.crmUserId, crmUserId)),
      ),
    );
}

async function isSuperAdministratorUser(userId: string) {
  const [row] = await db
    .select({ id: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, userId), eq(roles.slug, superAdministratorRoleSlug)))
    .limit(1);
  return Boolean(row);
}

const userOutranksCaller = () =>
  failure(permissionDenied("You can't change a user who has access you don't have."));
const roleOutranksCaller = () =>
  failure(permissionDenied("You can't assign a role with access you don't have."));

const superAdministratorLocked = () =>
  failure(
    permissionDenied("Only a Super Administrator can change a Super Administrator's account."),
  );

const optionalUuid = z.union([z.uuid(), z.literal("")]);
const userSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.email(),
  password: z.string().min(12).max(128),
  phone: z.string().trim().max(50).optional(),
  brokerId: optionalUuid,
  roleIds: z.array(z.uuid()).min(1),
  salesExecutiveIds: z.array(z.uuid()).optional(),
  brokerIds: z.array(z.uuid()).optional(),
  documents: z.array(z.instanceof(File)).max(5),
});
const accessSchema = z.object({
  id: z.uuid(),
  status: z.enum(["invited", "active", "inactive", "suspended"]),
  brokerId: optionalUuid,
  roleIds: z.array(z.uuid()).min(1),
  salesExecutiveIds: z.array(z.uuid()).optional(),
  // A Master Broker's brokers; omitted leaves them as they are.
  brokerIds: z.array(z.uuid()).optional(),
  // The user's own permission changes, saved with the access; omitted leaves them as they are.
  permissionOverrides: permissionOverridesSchema.optional(),
});
const userDocumentSchema = z.object({
  userId: z.uuid(),
  documentId: z.union([z.uuid(), z.literal("")]),
  file: z.instanceof(File),
});
const userCertificateSchema = z.object({
  userId: z.uuid(),
  file: z.instanceof(File),
  certificateNumber: z.string().trim().min(1).max(180),
  validFrom: z.iso.date(),
  validUntil: z.iso.date(),
});
const agentAccountSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.email(),
  password: z.string().min(12).max(128),
  phone: z.string().trim().max(50).optional(),
  // No longer asked on the form; agents.license stays NOT NULL, so it is stored empty.
  license: z.string().trim().max(180).optional().default(""),
  // Optional: an agent may work on their own, with no broker.
  brokerId: optionalUuid.optional().default(""),
  documents: z.array(z.instanceof(File)).max(5),
});

type StoredOnboardingFile = {
  name: string;
  storageKey: string;
  mimeType: string;
  size: number;
  checksum: string;
};

function parseOnboardingFiles(formData: FormData) {
  return (
    formData
      .getAll("documents")
      // An empty file input still submits a nameless, zero-byte part; documents are optional.
      .filter(
        (value): value is File => value instanceof File && Boolean(value.name) && value.size > 0,
      )
  );
}

async function validateOnboardingFiles(files: File[], required: boolean) {
  if (required && files.length === 0) return "Upload at least one credential document.";
  if (files.length > 5) return "Upload no more than 5 documents.";
  for (const file of files) {
    const error = await documentFileError(file);
    if (error) return error;
  }
  return null;
}

async function storeOnboardingFiles(
  organizationId: string,
  files: File[],
): Promise<StoredOnboardingFile[]> {
  // Production has no document storage yet; users without documents must not need it.
  if (!files.length) return [];
  const storage = getDocumentStorage();
  const stored: StoredOnboardingFile[] = [];
  try {
    for (const file of files) {
      const body = Buffer.from(await file.arrayBuffer());
      const storageKey = `${organizationId}/onboarding/${randomUUID()}.${documentFileTypes[file.type]}`;
      await storage.put(storageKey, body);
      stored.push({
        name: file.name.slice(0, 220) || "Onboarding document",
        storageKey,
        mimeType: file.type,
        size: file.size,
        checksum: createHash("sha256").update(body).digest("hex"),
      });
    }
    return stored;
  } catch (error) {
    await Promise.all(stored.map((file) => storage.remove(file.storageKey).catch(() => undefined)));
    throw error;
  }
}

async function removeOnboardingFiles(files: StoredOnboardingFile[]) {
  if (!files.length) return;
  const storage = getDocumentStorage();
  await Promise.all(files.map((file) => storage.remove(file.storageKey).catch(() => undefined)));
}

function onboardingDocumentValues(
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

async function validateUserAssignment(
  organizationId: string,
  roleIds: string[],
  brokerId: string,
  userId?: string,
  /** The broker already on record; keeping it is allowed even if it no longer qualifies as a new pick. */
  currentBrokerId?: string | null,
) {
  const validRoles = await db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), inArray(roles.id, roleIds)));
  if (validRoles.length !== new Set(roleIds).size) return "One or more roles are unavailable.";
  const requestsSuperAdministrator = validRoles.some(
    (role) => role.slug === superAdministratorRoleSlug,
  );
  let currentlySuperAdministrator = false;
  if (userId) {
    const existingSuperAdministratorRole = await db
      .select({ id: roles.id })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(roles.organizationId, organizationId),
          eq(roles.slug, "super-administrator"),
        ),
      )
      .limit(1);
    currentlySuperAdministrator = existingSuperAdministratorRole.length > 0;
  }
  if (requestsSuperAdministrator !== currentlySuperAdministrator)
    return "Super Administrator access can only be managed through provisioning.";
  const isAgent = validRoles.some((role) => role.slug === agentRoleSlug);
  if (userId && !isAgent) {
    const [agentProfile] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.userId, userId), eq(agents.organizationId, organizationId)))
      .limit(1);
    if (agentProfile) return "An Agent profile requires the user to keep the Agent role.";
  }
  // Every role, agents included, may be created without a broker.
  if (!brokerId) return null;
  if (brokerId === userId) return "A user cannot be assigned as their own broker.";
  const kept = brokerId === currentBrokerId;
  const [organizationBroker] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(users.id, userRoles.userId))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(users.id, brokerId),
        eq(users.organizationId, organizationId),
        eq(users.status, "active"),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!organizationBroker && !kept) return "The selected broker is unavailable.";
  const brokerRoles = await db
    .select({ slug: roles.slug })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, brokerId), eq(roles.organizationId, organizationId)));
  const brokerSlugs = brokerRoles.map((role) => role.slug.toLowerCase());
  const hasBrokerRole = brokerSlugs.some((brokerSlug) =>
    (brokerIdTargetRoleSlugs as readonly string[]).includes(brokerSlug),
  );
  if (
    !allowsTeamMember(
      brokerSlugs,
      validRoles.map((role) => role.slug),
    )
  )
    return "The selected team lead cannot manage this user role.";
  const hasAgentRole = brokerSlugs.includes(agentRoleSlug);
  const leadsAsMasterBroker =
    brokerSlugs.includes(masterBrokerRoleSlug) &&
    reportsToMasterBroker(validRoles.map((role) => role.slug));
  if ((!(hasBrokerRole || leadsAsMasterBroker) || hasAgentRole) && !kept)
    return "The selected user does not have a Broker role.";
  return null;
}

class TeamAssignmentError extends Error {}
async function saveTeamAssignments(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
  actorId: string,
  managerId: string,
  roleIds: string[],
  brokerId: string,
  selected?: string[],
  selectedBrokers?: string[],
) {
  const rows = await tx
    .select({
      id: users.id,
      brokerId: users.brokerId,
      status: users.status,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .for("update");
  const grants = await tx
    .select({ userId: userRoles.userId, slug: roles.slug })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.organizationId, organizationId));
  const ownRoles = await tx
    .select({ slug: roles.slug })
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), inArray(roles.id, roleIds)));
  const slugs = (id: string) =>
    id === managerId
      ? ownRoles.map((r) => r.slug)
      : grants.filter((r) => r.userId === id).map((r) => r.slug);
  const graph = new Map(rows.map((row) => [row.id, row.brokerId]));
  graph.set(managerId, brokerId || null);
  const changed = new Set<string>([managerId]);
  if (selected !== undefined) {
    const ids = new Set(selected);
    const allowed = teamMemberRoles(slugs(managerId));
    for (const id of ids) {
      const member = rows.find((row) => row.id === id);
      if (
        !member ||
        // Someone already on this team may stay even if no longer active; new picks must be.
        ((member.deletedAt || member.status !== "active") && member.brokerId !== managerId) ||
        id === managerId ||
        !allowed.some((role) => slugs(id).includes(role))
      )
        throw new TeamAssignmentError(
          "Select active agents or sales executives this role can lead.",
        );
      graph.set(id, managerId);
      changed.add(id);
    }
    for (const row of rows)
      if (
        row.brokerId === managerId &&
        slugs(row.id).some((role) => allowed.includes(role)) &&
        !ids.has(row.id)
      ) {
        graph.set(row.id, null);
        changed.add(row.id);
      }
  }
  if (selectedBrokers !== undefined) {
    const ids = new Set(selectedBrokers);
    const allowed = assignedBrokerRoles(slugs(managerId));
    for (const id of ids) {
      const member = rows.find((row) => row.id === id);
      if (
        !member ||
        // Someone already on this team may stay even if no longer active; new picks must be.
        ((member.deletedAt || member.status !== "active") && member.brokerId !== managerId) ||
        id === managerId ||
        !allowed.some((role) => slugs(id).includes(role))
      )
        throw new TeamAssignmentError(
          "Select active brokers with an allowed role from this organization.",
        );
      graph.set(id, managerId);
      changed.add(id);
    }
    // Brokers left out of the list stop reporting to this manager, including when it loses
    // the Master Broker role.
    const brokerRoles = assignedBrokerRoles([masterBrokerRoleSlug]);
    for (const row of rows)
      if (
        row.brokerId === managerId &&
        slugs(row.id).some((role) => brokerRoles.includes(role)) &&
        !ids.has(row.id)
      ) {
        graph.set(row.id, null);
        changed.add(row.id);
      }
  }
  for (const row of rows) {
    const parent = graph.get(row.id);
    if (parent && (changed.has(row.id) || parent === managerId)) {
      const lead = rows.find((candidate) => candidate.id === parent);
      // An inactive lead may stay on links that already exist, but cannot take new ones.
      const isNewLink = row.brokerId !== parent;
      if (
        !lead ||
        ((lead.deletedAt || lead.status !== "active") && isNewLink) ||
        !allowsTeamMember(slugs(parent), slugs(row.id))
      )
        throw new TeamAssignmentError(
          "The team assignment does not match the selected roles. Remove or reassign incompatible team members before saving.",
        );
      const seen = new Set([row.id]);
      let next: string | null | undefined = parent;
      while (next) {
        if (seen.has(next)) throw new TeamAssignmentError("Team assignments cannot form a cycle.");
        seen.add(next);
        next = graph.get(next);
      }
    }
  }
  for (const row of rows) {
    const next = graph.get(row.id) ?? null;
    if (row.brokerId === next) continue;
    await tx
      .update(users)
      .set({ brokerId: next, updatedAt: new Date() })
      .where(and(eq(users.id, row.id), eq(users.organizationId, organizationId)));
    await tx.insert(auditLogs).values({
      organizationId,
      actorUserId: actorId,
      action: "update",
      entityType: "user",
      entityId: row.id,
      oldValues: { brokerId: row.brokerId },
      newValues: { brokerId: next },
    });
  }
}

export async function createUser(formData: FormData): Promise<SettingsResult> {
  const context = await requirePermission("users.manage");
  if (!canManageUsers(context))
    return failure(permissionDenied("You don't have permission to manage users."));
  const parsed = userSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone"),
    // The broker picker is not rendered for Broker/Administrator roles.
    brokerId: formData.get("brokerId") ?? "",
    roleIds: formData
      .getAll("roleIds")
      .filter((value): value is string => typeof value === "string"),
    salesExecutiveIds:
      formData.has("salesExecutivesPresent") || formData.has("salesExecutiveIds")
        ? formData.getAll("salesExecutiveIds")
        : undefined,
    brokerIds: formData.has("brokerIds") ? formData.getAll("brokerIds") : undefined,
    documents: parseOnboardingFiles(formData),
  });
  if (!parsed.success)
    return validationFailureFromZod(
      parsed.error,
      "Enter a valid name, email, password of 12 to 128 characters, and at least one role.",
    );
  const v = parsed.data;
  if (!(await canAssignRoles(context, v.roleIds))) return roleOutranksCaller();
  const assignmentError = await validateUserAssignment(
    context.organizationId,
    v.roleIds,
    v.brokerId,
  );
  if (assignmentError) return validationFailure(assignmentError);
  const fileError = await validateOnboardingFiles(v.documents, false);
  if (fileError) return validationFailure(fileError);
  let storedFiles: StoredOnboardingFile[] = [];
  let id: string;
  try {
    const passwordHash = await hashPassword(v.password);
    storedFiles = await storeOnboardingFiles(context.organizationId, v.documents);
    id = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          organizationId: context.organizationId,
          brokerId: v.brokerId || null,
          email: v.email.toLowerCase(),
          firstName: v.firstName,
          lastName: v.lastName,
          phone: v.phone || null,
          status: "active",
        })
        .returning({ id: users.id });
      const identityId = randomUUID();
      await tx.insert(authUser).values({
        id: identityId,
        crmUserId: user.id,
        name: `${v.firstName} ${v.lastName}`,
        email: v.email.toLowerCase(),
        emailVerified: false,
      });
      await tx.insert(authAccount).values({
        id: randomUUID(),
        issuer: "local:credential",
        accountId: identityId,
        providerId: "credential",
        userId: identityId,
        password: passwordHash,
      });
      await tx.insert(userRoles).values(
        v.roleIds.map((roleId) => ({
          userId: user.id,
          roleId,
          assignedBy: context.userId,
        })),
      );
      if (storedFiles.length) {
        const uploadedDocuments = await tx
          .insert(documents)
          .values(
            onboardingDocumentValues(context.organizationId, context.userId, user.id, storedFiles),
          )
          .returning({
            id: documents.id,
            name: documents.name,
            mimeType: documents.mimeType,
            fileSizeBytes: documents.fileSizeBytes,
            checksumSha256: documents.checksumSha256,
          });
        await tx.insert(auditLogs).values(
          uploadedDocuments.map((document) => ({
            organizationId: context.organizationId,
            actorUserId: context.userId,
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
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "user",
        entityId: user.id,
        newValues: {
          email: v.email,
          brokerId: v.brokerId,
          roleIds: v.roleIds,
          status: "active",
        },
      });
      await saveTeamAssignments(
        tx,
        context.organizationId,
        context.userId,
        user.id,
        v.roleIds,
        v.brokerId,
        v.salesExecutiveIds,
        v.brokerIds,
      );
      return user.id;
    });
  } catch (error) {
    await removeOnboardingFiles(storedFiles);
    if (error instanceof TeamAssignmentError) return validationFailure(error.message);
    logError("User creation failed", error, { operation: "user_create" });
    return databaseFailure(
      "The user or onboarding documents could not be saved. The email may already be in use.",
    );
  }
  refresh("/settings/users");
  return success({ id });
}

export async function updateUserAccess(input: unknown): Promise<SettingsResult> {
  const context = await requirePermission("users.manage");
  if (!canManageUsers(context))
    return failure(permissionDenied("You don't have permission to manage users."));
  const parsed = accessSchema.safeParse(input);
  if (!parsed.success)
    return validationFailureFromZod(parsed.error, "Select a valid status and at least one role.");
  const v = parsed.data;
  const [target] = await db
    .select({
      id: users.id,
      status: users.status,
      brokerId: users.brokerId,
    })
    .from(users)
    .where(and(eq(users.id, v.id), eq(users.organizationId, context.organizationId)))
    .limit(1);
  if (!target) return failureFrom(ActionErrorCode.NOT_FOUND, "User not found.");
  if (target.id === context.userId)
    return validationFailure(
      "You cannot change your own access. Ask another administrator to change your roles.",
    );
  if (
    !context.roles.includes(superAdministratorRoleSlug) &&
    (await isSuperAdministratorUser(target.id))
  )
    return superAdministratorLocked();
  if (!(await canChangeUser(context, target.id))) return userOutranksCaller();
  const currentRoleIds = (
    await db.select({ id: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, target.id))
  ).map((row) => row.id);
  const addedRoleIds = v.roleIds.filter((id) => !currentRoleIds.includes(id));
  if (!(await canAssignRoles(context, addedRoleIds))) return roleOutranksCaller();
  const assignmentError = await validateUserAssignment(
    context.organizationId,
    v.roleIds,
    v.brokerId,
    v.id,
    target.brokerId,
  );
  if (assignmentError) return validationFailure(assignmentError);
  const overrides = v.permissionOverrides
    ? await checkPermissionOverrides(context, v.id, v.permissionOverrides)
    : null;
  if (overrides && !overrides.success) return overrides;
  try {
    await db.transaction(async (tx) => {
      await saveTeamAssignments(
        tx,
        context.organizationId,
        context.userId,
        v.id,
        v.roleIds,
        v.brokerId,
        v.salesExecutiveIds,
        v.brokerIds,
      );
      if (v.status !== "active" && target.status === "active")
        await handOverWork(tx, context.organizationId, context.userId, v.id, null);
      await tx
        .update(users)
        .set({
          status: v.status,
          brokerId: v.brokerId || null,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, v.id), eq(users.organizationId, context.organizationId)));
      if (v.status !== "active") await revokeUserSessions(tx, v.id);
      await tx.delete(userRoles).where(eq(userRoles.userId, v.id));
      await tx.insert(userRoles).values(
        v.roleIds.map((roleId) => ({
          userId: v.id,
          roleId,
          assignedBy: context.userId,
        })),
      );
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "user",
        entityId: v.id,
        oldValues: {
          status: target.status,
          brokerId: target.brokerId,
        },
        newValues: {
          status: v.status,
          brokerId: v.brokerId,
          roleIds: v.roleIds,
        },
      });
      if (overrides) await writePermissionOverrides(tx, context, v.id, overrides.data);
    });
    refresh("/settings/users");
    revalidatePath(`/settings/users/${v.id}`);
    return success({ id: v.id });
  } catch (error) {
    if (error instanceof TeamAssignmentError) return validationFailure(error.message);
    if (error instanceof HandoverError)
      return validationFailure(`${error.message} Deactivate them from the users list.`);
    logError("User update failed", error, { operation: "user_update" });
    return databaseFailure("The user access could not be updated.");
  }
}

const userStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["active", "inactive"]),
  /** Who takes over the user's contacts, deals and team when they leave. */
  handoverToUserId: optionalUuid.optional(),
});

export async function setUserStatus(input: unknown): Promise<SettingsResult> {
  const context = await requirePermission("users.manage");
  if (!canManageUsers(context))
    return failure(permissionDenied("You don't have permission to manage users."));
  const parsed = userStatusSchema.safeParse(input);
  if (!parsed.success)
    return validationFailureFromZod(parsed.error, "Select a valid account status.");
  const { id, status, handoverToUserId } = parsed.data;
  const [target] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, context.organizationId)))
    .limit(1);
  if (!target) return failureFrom(ActionErrorCode.NOT_FOUND, "User not found.");
  if (status !== "active" && target.id === context.userId)
    return validationFailure("You cannot deactivate your own account.");
  if (
    !context.roles.includes(superAdministratorRoleSlug) &&
    (await isSuperAdministratorUser(target.id))
  )
    return superAdministratorLocked();
  if (!(await canChangeUser(context, target.id))) return userOutranksCaller();
  if (target.status === status) return success({ id: target.id });
  try {
    await db.transaction(async (tx) => {
      const handover =
        status !== "active"
          ? await handOverWork(tx, context.organizationId, context.userId, id, handoverToUserId)
          : null;
      const broker =
        status === "active"
          ? await staleBrokerChange(tx, context.organizationId, id)
          : { oldValues: {}, newValues: {} };
      await tx
        .update(users)
        .set({ status, ...broker.newValues, updatedAt: new Date() })
        .where(and(eq(users.id, id), eq(users.organizationId, context.organizationId)));
      if (status !== "active") await revokeUserSessions(tx, id);
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "user",
        entityId: id,
        oldValues: { status: target.status, ...broker.oldValues },
        newValues: { status, handover, ...broker.newValues },
      });
    });
    refresh("/settings/users");
    return success({ id });
  } catch (error) {
    if (error instanceof HandoverError) return validationFailure(error.message);
    logError("User status change failed", error, { operation: "user_status" });
    return databaseFailure("The account status could not be changed.");
  }
}

const commissionRateSchema = z.object({
  id: z.uuid(),
  commissionRate: z.number().min(0).max(100).nullable(),
});

export async function setRoleCommissionRate(input: unknown): Promise<SettingsResult> {
  const context = await requirePermission("roles.manage");
  const parsed = commissionRateSchema.safeParse(input);
  if (!parsed.success)
    return validationFailureFromZod(parsed.error, "Enter a commission between 0 and 100%.");
  const { id } = parsed.data;
  const commissionRate =
    parsed.data.commissionRate === null ? null : parsed.data.commissionRate.toFixed(2);
  const [target] = await db
    .select({ id: roles.id, commissionRate: roles.commissionRate })
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.organizationId, context.organizationId)))
    .limit(1);
  if (!target) return failureFrom(ActionErrorCode.NOT_FOUND, "Role not found.");
  if (target.commissionRate === commissionRate) return success({ id });
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(roles)
        .set({ commissionRate, updatedAt: new Date() })
        .where(and(eq(roles.id, id), eq(roles.organizationId, context.organizationId)));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "role",
        entityId: id,
        oldValues: { commissionRate: target.commissionRate },
        newValues: { commissionRate },
      });
    });
    revalidatePath("/settings/commissions");
    return success({ id });
  } catch (error) {
    logError("Role commission change failed", error, { operation: "role_commission" });
    return databaseFailure("The commission could not be saved.");
  }
}

const commissionLinkSchema = z
  .object({
    roleId: z.uuid(),
    parentRoleId: z.uuid(),
    sellerRate: z.number().min(0).max(100),
    parentRate: z.number().min(0).max(100),
  })
  .refine((link) => link.roleId !== link.parentRoleId, "A role cannot be placed under itself.");

/** Places a role under another on Settings → Commissions, or updates the split if it already is. */
export async function saveCommissionLink(input: unknown): Promise<SettingsResult> {
  const context = await requirePermission("roles.manage");
  const parsed = commissionLinkSchema.safeParse(input);
  if (!parsed.success)
    return validationFailureFromZod(parsed.error, "Enter commissions between 0 and 100%.");
  const { roleId, parentRoleId } = parsed.data;
  const sellerRate = parsed.data.sellerRate.toFixed(2);
  const parentRate = parsed.data.parentRate.toFixed(2);
  const owned = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        inArray(roles.id, [roleId, parentRoleId]),
        eq(roles.organizationId, context.organizationId),
      ),
    );
  if (owned.length !== 2) return failureFrom(ActionErrorCode.NOT_FOUND, "Role not found.");
  try {
    const id = await db.transaction(async (tx) => {
      const [saved] = await tx
        .insert(commissionLinks)
        .values({
          organizationId: context.organizationId,
          roleId,
          parentRoleId,
          sellerRate,
          parentRate,
        })
        .onConflictDoUpdate({
          target: [commissionLinks.roleId, commissionLinks.parentRoleId],
          set: { sellerRate, parentRate, updatedAt: new Date() },
        })
        .returning({ id: commissionLinks.id });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "commission_link",
        entityId: saved.id,
        newValues: { roleId, parentRoleId, sellerRate, parentRate },
      });
      return saved.id;
    });
    revalidatePath("/settings/commissions");
    return success({ id });
  } catch (error) {
    logError("Commission link save failed", error, { operation: "commission_link_save" });
    return databaseFailure("The commission could not be saved.");
  }
}

export async function removeCommissionLink(input: unknown): Promise<SettingsResult> {
  const context = await requirePermission("roles.manage");
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error, "Select a valid link.");
  const { id } = parsed.data;
  try {
    const removed = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(commissionLinks)
        .where(
          and(
            eq(commissionLinks.id, id),
            eq(commissionLinks.organizationId, context.organizationId),
          ),
        )
        .returning();
      if (row)
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "delete",
          entityType: "commission_link",
          entityId: id,
          oldValues: {
            roleId: row.roleId,
            parentRoleId: row.parentRoleId,
            sellerRate: row.sellerRate,
            parentRate: row.parentRate,
          },
        });
      return Boolean(row);
    });
    if (!removed) return failureFrom(ActionErrorCode.NOT_FOUND, "Link not found.");
    revalidatePath("/settings/commissions");
    return success({ id });
  } catch (error) {
    logError("Commission link removal failed", error, { operation: "commission_link_remove" });
    return databaseFailure("The link could not be removed.");
  }
}

const userDeletionSchema = z.object({
  id: z.uuid(),
  deleted: z.boolean(),
  handoverToUserId: optionalUuid.optional(),
});

export async function setUserDeleted(input: unknown): Promise<SettingsResult> {
  const context = await requirePermission("users.manage");
  const parsed = userDeletionSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error, "Select a valid user.");
  const { id, deleted, handoverToUserId } = parsed.data;
  if (!hasPermission(context, deleted ? "users.delete" : "users.restore"))
    return failure(permissionDenied("You don't have permission to manage users."));
  if (id === context.userId) return validationFailure("You cannot archive your own account.");
  const [target] = await db
    .select({ id: users.id, status: users.status, deletedAt: users.deletedAt })
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, context.organizationId)))
    .limit(1);
  if (!target) return failureFrom(ActionErrorCode.NOT_FOUND, "User not found.");
  // Idempotent, like `setUserStatus`: a double-submit is not an error.
  if (Boolean(target.deletedAt) === deleted) return success({ id });
  // The Super Administrator is provisioned outside the app and cannot be removed here.
  if (await isSuperAdministratorUser(id))
    return failure(permissionDenied("A Super Administrator cannot be archived here."));
  if (!(await canChangeUser(context, id))) return userOutranksCaller();
  try {
    await db.transaction(async (tx) => {
      const handover = deleted
        ? await handOverWork(tx, context.organizationId, context.userId, id, handoverToUserId)
        : null;
      const broker = deleted
        ? { oldValues: {}, newValues: {} }
        : await staleBrokerChange(tx, context.organizationId, id);
      // A restored user comes back inactive; an admin activates them deliberately.
      const restored = deleted ? {} : { status: "inactive" };
      await tx
        .update(users)
        .set({
          deletedAt: deleted ? new Date() : null,
          ...restored,
          ...broker.newValues,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, id), eq(users.organizationId, context.organizationId)));
      if (deleted) await revokeUserSessions(tx, id);
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: deleted ? "delete" : "restore",
        entityType: "user",
        entityId: id,
        oldValues: {
          deletedAt: target.deletedAt,
          ...(deleted ? {} : { status: target.status }),
          ...broker.oldValues,
        },
        newValues: {
          deletedAt: deleted ? "now" : null,
          handover,
          ...restored,
          ...broker.newValues,
        },
      });
    });
    refresh("/settings/users");
    revalidatePath("/settings/archived-users");
    return success({ id });
  } catch (error) {
    if (error instanceof HandoverError) return validationFailure(error.message);
    logError("User deletion change failed", error, {
      operation: deleted ? "user_delete" : "user_restore",
    });
    return databaseFailure(
      deleted ? "The user could not be archived." : "The user could not be restored.",
    );
  }
}

export async function createAgentAccount(formData: FormData): Promise<SettingsResult> {
  const context = await requireAuthorizationContext();
  if (!canManageUsers(context))
    return failure(permissionDenied("You don't have permission to manage users."));
  const parsed = agentAccountSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone"),
    license: formData.get("license") ?? undefined,
    brokerId: formData.get("brokerId") ?? "",
    documents: parseOnboardingFiles(formData),
  });
  if (!parsed.success)
    return validationFailureFromZod(
      parsed.error,
      "Enter valid agent details and a password of 12 to 128 characters.",
    );
  const value = parsed.data;
  const [agentRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, context.organizationId), eq(roles.slug, "agent")))
    .limit(1);
  if (!agentRole) return validationFailure("The Agent role is unavailable. Run the seed first.");
  if (!(await canAssignRoles(context, [agentRole.id]))) return roleOutranksCaller();
  const fileError = await validateOnboardingFiles(value.documents, false);
  if (fileError) return validationFailure(fileError);
  const assignmentError = await validateUserAssignment(
    context.organizationId,
    [agentRole.id],
    value.brokerId,
  );
  if (assignmentError) return validationFailure(assignmentError);

  let storedFiles: StoredOnboardingFile[] = [];
  let agentId: string;
  try {
    const passwordHash = await hashPassword(value.password);
    storedFiles = await storeOnboardingFiles(context.organizationId, value.documents);
    agentId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          organizationId: context.organizationId,
          brokerId: value.brokerId || null,
          email: value.email.toLowerCase(),
          firstName: value.firstName,
          lastName: value.lastName,
          phone: value.phone || null,
          status: "active",
        })
        .returning({ id: users.id });
      const identityId = randomUUID();
      await tx.insert(authUser).values({
        id: identityId,
        crmUserId: user.id,
        name: `${value.firstName} ${value.lastName}`,
        email: value.email.toLowerCase(),
        emailVerified: false,
      });
      await tx.insert(authAccount).values({
        id: randomUUID(),
        issuer: "local:credential",
        accountId: identityId,
        providerId: "credential",
        userId: identityId,
        password: passwordHash,
      });
      await tx.insert(userRoles).values({
        userId: user.id,
        roleId: agentRole.id,
        assignedBy: context.userId,
      });
      const [agent] = await tx
        .insert(agents)
        .values({
          organizationId: context.organizationId,
          userId: user.id,
          license: value.license,
        })
        .returning({ id: agents.id });
      if (storedFiles.length) {
        const uploadedDocuments = await tx
          .insert(documents)
          .values(
            onboardingDocumentValues(context.organizationId, context.userId, user.id, storedFiles),
          )
          .returning({
            id: documents.id,
            name: documents.name,
            mimeType: documents.mimeType,
            fileSizeBytes: documents.fileSizeBytes,
            checksumSha256: documents.checksumSha256,
          });
        await tx.insert(auditLogs).values(
          uploadedDocuments.map((document) => ({
            organizationId: context.organizationId,
            actorUserId: context.userId,
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
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "agent",
        entityId: agent.id,
        newValues: {
          userId: user.id,
          teamLeadId: value.brokerId || null,
        },
      });
      return agent.id;
    });
  } catch (error) {
    await removeOnboardingFiles(storedFiles);
    logError("Agent creation failed", error, { operation: "agent_create" });
    return databaseFailure("The Agent could not be created. The email may already be in use.");
  }
  refresh("/settings/users");
  return success({ id: agentId });
}

export async function saveUserDocument(formData: FormData): Promise<SettingsResult> {
  const context = await requirePermission("users.manage");
  if (!canManageUsers(context))
    return failure(permissionDenied("You don't have permission to manage users."));
  const parsed = userDocumentSchema.safeParse({
    userId: formData.get("userId"),
    documentId: formData.get("documentId") || "",
    file: formData.get("file"),
  });
  if (!parsed.success)
    return validationFailureFromZod(parsed.error, "Select a valid document to upload.");
  const value = parsed.data;
  const fileError = await validateOnboardingFiles([value.file], true);
  if (fileError) return validationFailure(fileError);
  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, value.userId),
        eq(users.organizationId, context.organizationId),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!targetUser) return failureFrom(ActionErrorCode.NOT_FOUND, "User not found.");

  const [existing] = value.documentId
    ? await db
        .select({
          id: documents.id,
          name: documents.name,
          storageKey: documents.storageKey,
        })
        .from(documents)
        .where(
          and(
            eq(documents.id, value.documentId),
            eq(documents.userId, value.userId),
            eq(documents.organizationId, context.organizationId),
          ),
        )
        .limit(1)
    : [];
  if (value.documentId && !existing)
    return failureFrom(ActionErrorCode.NOT_FOUND, "That document is not attached to this user.");

  let storedFiles: StoredOnboardingFile[] = [];
  let documentId: string;
  try {
    storedFiles = await storeOnboardingFiles(context.organizationId, [value.file]);
    const file = storedFiles[0];
    documentId = await db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(documents)
          .set({
            name: file.name,
            category: "other",
            storageKey: file.storageKey,
            mimeType: file.mimeType,
            fileSizeBytes: file.size,
            checksumSha256: file.checksum,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(documents.id, existing.id),
              eq(documents.userId, value.userId),
              eq(documents.organizationId, context.organizationId),
            ),
          );
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "update",
          entityType: "document",
          entityId: existing.id,
          oldValues: { name: existing.name },
          newValues: {
            name: file.name,
            mimeType: file.mimeType,
            fileSize: file.size,
            checksum: file.checksum,
            userId: value.userId,
          },
        });
        return existing.id;
      }

      const [document] = await tx
        .insert(documents)
        .values(
          onboardingDocumentValues(
            context.organizationId,
            context.userId,
            value.userId,
            storedFiles,
          ),
        )
        .returning({ id: documents.id });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "document",
        entityId: document.id,
        newValues: {
          name: file.name,
          mimeType: file.mimeType,
          fileSize: file.size,
          checksum: file.checksum,
          userId: value.userId,
        },
      });
      return document.id;
    });

    if (existing)
      await getDocumentStorage()
        .remove(existing.storageKey)
        .catch((error) =>
          logError("Old user document cleanup failed", error, {
            operation: "document_cleanup",
          }),
        );
  } catch (error) {
    await removeOnboardingFiles(storedFiles);
    logError("User document save failed", error, {
      operation: "document_save",
    });
    return databaseFailure("The user document could not be saved.");
  }
  refresh("/settings/users");
  refresh("/documents");
  return success({ id: documentId });
}

export async function saveUserCertificate(formData: FormData): Promise<SettingsResult> {
  const context = await requirePermission("users.manage");
  if (!canManageUsers(context))
    return failure(permissionDenied("You don't have permission to manage users."));
  const parsed = userCertificateSchema.safeParse({
    userId: formData.get("userId"),
    file: formData.get("file"),
    certificateNumber: formData.get("certificateNumber"),
    validFrom: formData.get("validFrom"),
    validUntil: formData.get("validUntil"),
  });
  if (!parsed.success)
    return validationFailureFromZod(
      parsed.error,
      "Enter the certificate number and validity dates, then select a file.",
    );
  const value = parsed.data;
  if (value.validUntil < value.validFrom)
    return validationFailure("The expiry date must be on or after the start date.");
  const fileError = await validateOnboardingFiles([value.file], true);
  if (fileError) return validationFailure(fileError);

  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, value.userId),
        eq(users.organizationId, context.organizationId),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!targetUser) return failureFrom(ActionErrorCode.NOT_FOUND, "User not found.");
  const targetRoles = await db
    .select({ slug: roles.slug })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(eq(userRoles.userId, value.userId), eq(roles.organizationId, context.organizationId)),
    );
  // `agentRoleSlugs` is the agent-side family: Agent, Broker and Master Broker.
  if (!targetRoles.some((role) => isAgentRoleSlug(role.slug)))
    return validationFailure("Certificates can only be attached to agent or broker accounts.");

  let storedFiles: StoredOnboardingFile[] = [];
  try {
    storedFiles = await storeOnboardingFiles(context.organizationId, [value.file]);
    const documentId = await db.transaction(async (tx) => {
      const [document] = await tx
        .insert(documents)
        .values({
          ...onboardingDocumentValues(
            context.organizationId,
            context.userId,
            value.userId,
            storedFiles,
          )[0],
          documentType: "accreditation_certificate",
          category: "other",
          validFrom: value.validFrom,
          validUntil: value.validUntil,
          certificateNumber: value.certificateNumber,
        })
        .returning({ id: documents.id });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "document",
        entityId: document.id,
        newValues: {
          documentType: "accreditation_certificate",
          certificateNumber: value.certificateNumber,
          validFrom: value.validFrom,
          validUntil: value.validUntil,
          userId: value.userId,
        },
      });
      return document.id;
    });
    refresh("/settings/users");
    refresh("/documents");
    return success({ id: documentId });
  } catch (error) {
    await removeOnboardingFiles(storedFiles);
    logError("User certificate save failed", error, {
      operation: "certificate_save",
    });
    return databaseFailure("The accreditation certificate could not be saved.");
  }
}

export async function updateRolePermissions(input: unknown): Promise<SettingsResult> {
  const context = await requirePermission("roles.manage");
  const parsed = z
    .object({
      roleId: z.uuid(),
      permissionKeys: z.array(z.string().min(1).max(150)).max(500),
    })
    .safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error, "Invalid role permissions.");

  // Retired keys the Roles page still lists are dropped on save rather than blocking it.
  const requested = [...new Set(parsed.data.permissionKeys)].filter(isPermissionKey);

  const [role] = await db
    .select({ id: roles.id, name: roles.name, slug: roles.slug })
    .from(roles)
    .where(and(eq(roles.id, parsed.data.roleId), eq(roles.organizationId, context.organizationId)))
    .limit(1);
  if (!role) return failureFrom(ActionErrorCode.NOT_FOUND, "Role not found.");

  const isSuperAdministrator = context.roles.includes(superAdministratorRoleSlug);
  if (role.slug === superAdministratorRoleSlug)
    return failure(
      permissionDenied(
        "The Super Administrator role is managed by the system and cannot be edited here.",
      ),
    );
  if (role.slug === administratorRoleSlug && !isSuperAdministrator)
    return failure(
      permissionDenied("Only a Super Administrator can change the Administrator role."),
    );
  // What the role has now, for the remove check and the audit log.
  const current = (
    await db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, role.id))
  )
    .map((row) => row.key)
    .filter(isPermissionKey);
  if (!isSuperAdministrator) {
    // Editing a role you hold would let you change your own access.
    const [held] = await db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(and(eq(userRoles.userId, context.userId), eq(userRoles.roleId, role.id)))
      .limit(1);
    if (held)
      return failure(
        permissionDenied("You can't change a role you hold. Ask another administrator."),
      );
    const unavailable = requested.filter((key) => !context.permissions.has(key));
    if (unavailable.length)
      return failure(permissionDenied("You cannot grant permissions you do not hold yourself."));
    // Taking one away is as much a change as giving it.
    const removing = current.filter((key) => !requested.includes(key));
    if (removing.some((key) => !context.permissions.has(key)))
      return failure(permissionDenied("You cannot remove permissions you do not hold yourself."));
  }
  const changes = buildChangeSet(
    { permissionKeys: [...current].sort() },
    { permissionKeys: [...requested].sort() },
  );

  try {
    await db.transaction(async (tx) => {
      if (requested.length)
        await tx
          .insert(permissions)
          .values(
            requested.map((key) => ({
              key,
              module: permissionModule(key),
              description: permissionMetadata[key].description,
            })),
          )
          .onConflictDoNothing({ target: permissions.key });

      const rows = requested.length
        ? await tx
            .select({ id: permissions.id })
            .from(permissions)
            .where(inArray(permissions.key, requested))
        : [];

      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
      if (rows.length)
        await tx
          .insert(rolePermissions)
          .values(rows.map((v) => ({ roleId: role.id, permissionId: v.id })));
      if (!isEmptyChangeSet(changes))
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "update",
          entityType: "role_permissions",
          entityId: role.id,
          ...changes,
        });
    });
  } catch (error) {
    logError("Role permissions save failed", error, { operation: "role_permissions_save" });
    return databaseFailure("The role permissions could not be saved.");
  }
  refresh("/settings/roles");
  return success({ id: role.id });
}
