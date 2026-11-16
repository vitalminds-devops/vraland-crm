import { redirect } from "next/navigation";

import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { DeletedUsersTable } from "@/features/settings/components/users/deleted-users-table";
import { BackButton } from "@/components/common/back-button";
import { listDeletedUsers } from "@/features/settings/queries/settings.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { canManageUsers } from "@/lib/permissions/policy";

export default async function ArchivedUsersPage() {
  const context = await requirePagePermission("users.restore");
  if (!canManageUsers(context)) redirect("/forbidden");
  const rows = await listDeletedUsers();

  return (
    <PageContainer>
      <PageHeader
        title="Archived users"
        description="Restore to bring a user back."
        actions={<BackButton fallbackHref="/settings/users" label="Back to users" />}
      />
      <DeletedUsersTable users={rows} />
    </PageContainer>
  );
}
