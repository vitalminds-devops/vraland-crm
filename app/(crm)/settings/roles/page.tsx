import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { RolesWorkspace } from "@/features/settings/components/roles/roles-workspace";
import { SettingsNav } from "@/features/settings/components/settings-nav";
import { listRoles } from "@/features/settings/queries/settings.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
import {
  administratorRoleSlug,
  permissionKeys,
  rolePermissionDefaults,
  superAdministratorRoleSlug,
  type RoleSlug,
} from "@/lib/permissions/catalog";

const roleOrder = Object.keys(rolePermissionDefaults) as RoleSlug[];

const rank = (slug: string) => {
  const index = roleOrder.indexOf(slug as RoleSlug);
  return index === -1 ? roleOrder.length : index;
};

export default async function RolesPage() {
  const context = await requirePagePermission("roles.manage");
  const data = await listRoles();

  const isSuperAdministrator = context.roles.includes(superAdministratorRoleSlug);
  const roles = [...data.roles]
    .filter(
      (role) =>
        role.slug !== superAdministratorRoleSlug &&
        (isSuperAdministrator || role.slug !== administratorRoleSlug),
    )
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name));

  const catalogKeys = new Set<string>(permissionKeys);
  const permissionOptions = [
    ...permissionKeys.map((key) => ({ key, module: key.split(".")[0] })),
    ...data.permissions
      .filter((row) => !catalogKeys.has(row.key))
      .map((row) => ({ key: row.key, module: row.module })),
  ];
  const keyById = new Map(data.permissions.map((row) => [row.id, row.key]));

  return (
    <PageContainer>
      <PageHeader title="Roles & permissions" description="What each role can do and see." />
      <SettingsNav permissions={context.permissions} current="/settings/roles" />
      <RolesWorkspace
        permissions={permissionOptions}
        roles={roles.map((role) => ({
          id: role.id,
          slug: role.slug,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          granted: data.grants
            .filter((grant) => grant.roleId === role.id)
            .map((grant) => keyById.get(grant.permissionId))
            .filter((key): key is string => key !== undefined),
        }))}
      />
    </PageContainer>
  );
}
