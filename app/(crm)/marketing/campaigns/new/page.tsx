import { BackButton } from "@/components/common/back-button";
import { FormNavigation } from "@/components/common/form-navigation";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { formCardClass } from "@/components/ui/form-kit";
import { CampaignForm } from "@/features/marketing/components/campaign-form";
import { campaignFormSections } from "@/features/marketing/lib/form-sections";
import { getMarketingOptions } from "@/features/marketing/queries/marketing.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function NewCampaignPage() {
  await requirePagePermission("marketing.manage");
  const options = await getMarketingOptions();

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="New campaign"
        description="Pick a message and who gets it."
        actions={<BackButton fallbackHref="/marketing/campaigns" label="Back to campaigns" />}
      />
      <div className="mt-6 flex gap-8">
        <FormNavigation sections={campaignFormSections} />
        <div className={formCardClass}>
          <CampaignForm options={options} />
        </div>
      </div>
    </PageContainer>
  );
}
