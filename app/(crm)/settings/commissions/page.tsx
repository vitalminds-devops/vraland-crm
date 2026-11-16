import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { CommissionBoard } from "@/features/settings/components/roles/commission-board";
import { SettingsNav } from "@/features/settings/components/settings-nav";
import { listRoleCommissions } from "@/features/settings/queries/settings.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function CommissionsPage() {
  const context = await requirePagePermission("roles.manage");
  const { roles, links } = await listRoleCommissions();

  return (
    <PageContainer>
      <PageHeader title="Commissions" description="What each role earns on a won lead." />
      <SettingsNav permissions={context.permissions} current="/settings/commissions" />
      <CommissionBoard roles={roles} links={links} />
    </PageContainer>
  );
}
