import { redirect } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { AgentCreateForm } from "@/features/settings/components/settings-forms";
import { listUsers } from "@/features/settings/queries/settings.queries";
import { SettingsNav } from "@/features/settings/components/settings-nav";
import { canManageUsers } from "@/lib/permissions/policy";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function NewAgentPage() {
  const context = await requirePagePermission("users.manage");
  if (!canManageUsers(context)) redirect("/forbidden");
  const { brokers } = await listUsers();

  return (
    <PageContainer>
      <PageHeader
        title="Add agent"
        description="Create an agent account."
        actions={<BackButton fallbackHref="/settings/users" label="Back to users" />}
      />
      <SettingsNav permissions={context.permissions} current="/settings/users" />
      <AgentCreateForm brokers={brokers} />
    </PageContainer>
  );
}
