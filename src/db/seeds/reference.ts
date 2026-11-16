import { eq } from "drizzle-orm";

import { db } from "../client";
import { organizations, permissions, rolePermissions, roles } from "../schema";
import {
  permissionKeys,
  permissionMetadata,
  roleDataScopeDefaults,
  roleDescriptions,
  roleLabels,
  rolePermissionDefaults,
  type RoleSlug,
} from "../../lib/permissions/catalog";

/** Drizzle transaction handle, so reference data shares the caller's transaction. */
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SeededReferenceData = {
  organization: { id: string; name: string; code: string };
  rolesBySlug: Record<string, { id: string }>;
};

export async function seedReferenceData(
  tx: DbTransaction,
  input: { organizationName: string; organizationCode: string },
): Promise<SeededReferenceData> {
  const insertedOrganization = await tx
    .insert(organizations)
    .values({ name: input.organizationName, code: input.organizationCode })
    .onConflictDoNothing({ target: organizations.code })
    .returning();

  const organization =
    insertedOrganization[0] ??
    (
      await tx
        .select()
        .from(organizations)
        .where(eq(organizations.code, input.organizationCode))
        .limit(1)
    )[0];

  await tx
    .insert(permissions)
    .values(
      permissionKeys.map((key) => ({
        key,
        module: key.split(".")[0],
        description: permissionMetadata[key].description,
      })),
    )
    .onConflictDoNothing();

  const allPermissions = await tx
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions);

  const rolesBySlug: Record<string, { id: string }> = {};
  for (const [slug, grantedKeys] of Object.entries(rolePermissionDefaults) as [
    RoleSlug,
    readonly string[],
  ][]) {
    const [role] = await tx
      .insert(roles)
      .values({
        organizationId: organization.id,
        name: roleLabels[slug],
        slug,
        description: roleDescriptions[slug],
        isSystem: true,
        dataScope: roleDataScopeDefaults[slug],
      })
      .onConflictDoUpdate({
        target: [roles.organizationId, roles.slug],
        set: {
          name: roleLabels[slug],
          dataScope: roleDataScopeDefaults[slug],
        },
      })
      .returning();

    const grants = allPermissions
      .filter((permission) => grantedKeys.includes(permission.key))
      .map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      }));
    if (grants.length) await tx.insert(rolePermissions).values(grants).onConflictDoNothing();

    rolesBySlug[slug] = { id: role.id };
  }

  return { organization, rolesBySlug };
}
