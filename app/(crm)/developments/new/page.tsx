import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { FormNavigation } from "@/components/common/form-navigation";
import { formCardClass } from "@/components/ui/form-kit";
import {
  DevelopmentForm,
  developmentFormSections,
} from "@/features/developments/components/development-form";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function NewDevelopmentPage() {
  await requirePagePermission("developments.create");
  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Add development"
        description="A project that holds properties and units."
        actions={<BackButton fallbackHref="/developments" label="Back to developments" />}
      />
      <div className="mt-6 flex gap-8">
        <FormNavigation sections={developmentFormSections} />
        <div className={formCardClass}>
          <DevelopmentForm />
        </div>
      </div>
    </PageContainer>
  );
}
