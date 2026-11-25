import "../../config/load-environment";
import { and, eq, inArray } from "drizzle-orm";

import { closeDatabaseConnection, db } from "../client";
import { permissions, rolePermissions, roles } from "../schema";
import {
  permissionKeys,
  permissionMetadata,
  permissionModule,
  rolePermissionDefaults,
  type RoleSlug,
} from "../../lib/permissions/catalog";
import { permissionSyncPlan } from "./permission-sync-plan";

const roleSlugs = Object.keys(rolePermissionDefaults) as RoleSlug[];

if (process.argv.includes("--revoke")) {
  console.warn(
    "db:sync-permissions no longer removes grants; --revoke is a no-op. " +
      "Removing a permission from a role is an explicit action on Settings → Roles & permissions.",
  );
}

try {
  await db.transaction(async (tx) => {
    const catalog = permissionKeys.map((key) => ({
      key,
      module: permissionModule(key),
      description: permissionMetadata[key].description,
    }));
    const plan = permissionSyncPlan(
      await tx
        .select({
          key: permissions.key,
          module: permissions.module,
          description: permissions.description,
        })
        .from(permissions),
      catalog,
    );
    const insertedThisRun = new Set(plan.added);
    if (plan.added.length)
      await tx
        .insert(permissions)
        .values(catalog.filter((entry) => insertedThisRun.has(entry.key)))
        .onConflictDoNothing({ target: permissions.key });
    // The catalog's wording wins, so the database never keeps an old description.
    for (const entry of plan.outdated)
      await tx
        .update(permissions)
        .set({ module: entry.module, description: entry.description })
        .where(eq(permissions.key, entry.key));

    const permissionRows = await tx
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions);
    const idByKey = new Map(permissionRows.map((row) => [row.key, row.id]));

    // System roles only. A custom role is never read or written here.
    const roleRows = await tx
      .select({
        id: roles.id,
        slug: roles.slug,
        name: roles.name,
      })
      .from(roles)
      .where(and(eq(roles.isSystem, true), inArray(roles.slug, roleSlugs)));

    let added = 0;

    for (const role of roleRows) {
      const wanted = new Set<string>();

      if (role.slug === "super-administrator") {
        // Locked to every key. Additive only.
        for (const row of permissionRows) wanted.add(row.id);
      } else {
        for (const key of rolePermissionDefaults[role.slug as RoleSlug] ?? []) {
          if (!insertedThisRun.has(key)) continue;
          const id = idByKey.get(key);
          if (id) wanted.add(id);
        }
      }

      const current = await tx
        .select({ permissionId: rolePermissions.permissionId })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, role.id));
      const present = new Set(current.map((row) => row.permissionId));

      const toAdd = [...wanted].filter((id) => !present.has(id));
      if (toAdd.length) {
        await tx
          .insert(rolePermissions)
          .values(toAdd.map((permissionId) => ({ roleId: role.id, permissionId })))
          .onConflictDoNothing();
        added += toAdd.length;
      }
    }

    console.info(
      `Permissions synced: ${permissionKeys.length} key(s) in catalog, ` +
        `${insertedThisRun.size} newly inserted this run, ` +
        `${plan.outdated.length} description(s) refreshed, ` +
        `${roleRows.length} system role(s) reconciled, ${added} grant(s) added. ` +
        `Existing grants were left untouched, data scopes were not rewritten, ` +
        `and custom roles were not touched.`,
    );
    // Kept, not deleted: a role may still hold one. Remove them on Settings → Roles.
    if (plan.retired.length)
      console.warn(
        `${plan.retired.length} permission key(s) are no longer in the catalog: ${plan.retired.join(", ")}.`,
      );
  });
} finally {
  await closeDatabaseConnection();
}
