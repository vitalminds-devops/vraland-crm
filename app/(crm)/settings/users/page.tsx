import { redirect } from "next/navigation";

import { PageContainer } from "@/components/common/page-container";
import { UsersWorkspace } from "../../../../src/features/settings/components/users-workspace";
import { listUsers } from "@/features/settings/queries/settings.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { canManageUsers } from "@/lib/permissions/policy";

export default async function UsersPage() {
  const context = await requirePagePermission("users.manage");
  if (!canManageUsers(context)) redirect("/forbidden");

  const data = await listUsers();

  return (
    <PageContainer>
      <UsersWorkspace
        users={data.rows}
        currentUserId={context.userId}
        roles={data.roles}
        brokers={data.brokers}
        permissions={[...context.permissions]}
      />
    </PageContainer>
  );
}
