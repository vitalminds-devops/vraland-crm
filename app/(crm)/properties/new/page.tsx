import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { FormNavigation } from "@/components/common/form-navigation";
import { formCardClass } from "@/components/ui/form-kit";
import { PropertyForm, propertyFormSections } from "@/features/properties";
import { getPropertyOptions } from "@/features/properties/queries/property.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
export default async function NewPropertyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("properties.create");
  const params = await searchParams;
  const options = await getPropertyOptions();
  const developmentId = typeof params.developmentId === "string" ? params.developmentId : undefined;
  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Add property"
        description="Only the name is required."
        actions={<BackButton fallbackHref="/properties" label="Back to properties" />}
      />
      <div className="mt-4 flex gap-6 [&>aside]:w-48">
        <FormNavigation sections={propertyFormSections} />
        <div className={formCardClass}>
          <PropertyForm options={options} initial={developmentId ? { developmentId } : undefined} />
        </div>
      </div>
    </PageContainer>
  );
}
