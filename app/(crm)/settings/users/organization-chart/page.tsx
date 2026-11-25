
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { OrganizationChart } from "../../../../../src/features/settings/components/organization-chart";
import { SettingsNav } from "@/features/settings/components/settings-nav";
import { listUsers } from "@/features/settings/queries/settings.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function OrganizationChartPage() {
  const context = await requirePagePermission("users.manage");
  const { rows } = await listUsers();

  return (
    <PageContainer>
      <PageHeader
        title="Organization chart"
        description="Who reports to whom."
        actions={<BackButton fallbackHref="/settings/users" label="Back to users" />}
      />
      <SettingsNav permissions={context.permissions} current="/settings/users" />
      <OrganizationChart users={rows} />
    </PageContainer>
  );
}
