import { BackButton } from "@/components/common/back-button";
import { FormNavigation } from "@/components/common/form-navigation";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { formCardClass } from "@/components/ui/form-kit";
import { SequenceForm } from "@/features/marketing/components/sequence-form";
import { sequenceFormSections } from "@/features/marketing/lib/form-sections";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function NewSequencePage() {
  await requirePagePermission("marketing.manage");

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Add follow-up"
        description="Name it and choose what starts it."
        actions={<BackButton fallbackHref="/marketing/automations" label="Back to follow-ups" />}
      />
      <div className="mt-6 flex gap-8">
        <FormNavigation sections={sequenceFormSections} />
        <div className={formCardClass}>
          <SequenceForm />
        </div>
      </div>
    </PageContainer>
  );
}
