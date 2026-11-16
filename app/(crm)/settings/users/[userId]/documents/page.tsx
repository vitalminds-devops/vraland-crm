import { notFound, redirect } from "next/navigation";

import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { UserDocumentsWorkspace } from "@/features/settings/components/user-documents-workspace";
import { getUserDocumentsWorkspace } from "@/features/settings/queries/settings.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { canManageUsers } from "@/lib/permissions/policy";

export default async function UserDocumentsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const context = await requirePagePermission("users.manage");
  if (!canManageUsers(context)) redirect("/forbidden");

  const { userId } = await params;
  const data = await getUserDocumentsWorkspace(userId);
  if (!data) notFound();

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title={`${data.user.firstName} ${data.user.lastName}`}
        description="Certificates and documents"
        actions={<BackButton fallbackHref="/settings/users" label="Back to users" />}
      />
      <UserDocumentsWorkspace user={data.user} documents={data.documents} />
    </PageContainer>
  );
}
