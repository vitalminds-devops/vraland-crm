import { BackButton } from "@/components/common/back-button";
import { FormNavigation } from "@/components/common/form-navigation";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { formCardClass } from "@/components/ui/form-kit";
import { SmsTemplateForm } from "@/features/marketing/components/sms-template-form";
import { smsTemplateFormSections } from "@/features/marketing/lib/form-sections";
import { getTemplateCategories } from "@/features/marketing/queries/marketing.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function NewSmsTemplatePage() {
  await requirePagePermission("marketing.manage");
  const categories = await getTemplateCategories();

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Add SMS template"
        actions={<BackButton fallbackHref="/marketing/sms-templates" label="Back to templates" />}
      />
      <div className="mt-6 flex gap-8">
        <FormNavigation sections={smsTemplateFormSections} />
        <div className={formCardClass}>
          <SmsTemplateForm categories={categories.sms} />
        </div>
      </div>
    </PageContainer>
  );
}
