import { notFound } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { FormNavigation } from "@/components/common/form-navigation";
import { formCardClass } from "@/components/ui/form-kit";
import {
  DevelopmentForm,
  developmentFormSections,
  formatDateForInput,
} from "@/features/developments";
import { getDevelopment } from "@/features/developments/queries/development.queries";
import { developmentCoverImageUrl } from "@/features/developments/lib/cover-image";
import type { DevelopmentInput } from "@/features/developments/schemas/development.schema";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function EditDevelopmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("developments.update");
  const { id } = await params;
  const data = await getDevelopment(id);
  if (!data) notFound();
  const r = data.record;
  const initial: Partial<DevelopmentInput> = {
    name: r.name,
    description: r.description,
    status: r.status as DevelopmentInput["status"],
    addressLine1: r.addressLine1,
    barangay: r.barangay,
    city: r.city,
    province: r.province,
    postalCode: r.postalCode,
    launchDate: formatDateForInput(r.launchDate),
    completionDate: formatDateForInput(r.completionDate),
  };
  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title={`Edit ${r.name}`}
        description="Update this development."
        actions={<BackButton fallbackHref={`/developments/${id}`} label="Back to development" />}
      />
      {/* The same shell as the create page, and the same as the contact form. */}
      <div className="mt-6 flex gap-8">
        <FormNavigation sections={developmentFormSections} />
        <div className={formCardClass}>
          <DevelopmentForm
            developmentId={id}
            initial={initial}
            coverImageUrl={developmentCoverImageUrl(r)}
          />
        </div>
      </div>
    </PageContainer>
  );
}
