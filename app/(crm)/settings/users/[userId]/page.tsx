import { notFound, redirect } from "next/navigation";

import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { UserEditForm } from "@/features/settings/components/users/user-edit-form";
import { displayName } from "@/features/settings/components/users/user-types";
import { listUsers } from "@/features/settings/queries/settings.queries";
import { getUserPermissionEditor } from "@/features/settings/queries/user-permissions.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { canManageUsers } from "@/lib/permissions/policy";

export default async function UserEditPage({ params }: { params: Promise<{ userId: string }> }) {
  const context = await requirePagePermission("users.manage");
  if (!canManageUsers(context)) redirect("/forbidden");
  const { userId } = await params;
  // Your own access is changed by another administrator, not here.
  if (userId === context.userId) redirect("/settings/users");
  const [data, permissionEditor] = await Promise.all([
    listUsers(),
    getUserPermissionEditor(userId),
  ]);
  const user = data.rows.find((row) => row.id === userId);
  if (!user) notFound();

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title={displayName(user)}
        description={user.email}
        actions={<BackButton fallbackHref="/settings/users" label="Back to users" />}
      />
      <div className="mt-6 flex gap-8">
        <UserEditForm
          key={user.id}
          users={data.rows}
          user={user}
          roles={data.roles}
          brokers={data.brokers}
          permissionEditor={permissionEditor ?? undefined}
        />
      </div>
    </PageContainer>
  );
}
