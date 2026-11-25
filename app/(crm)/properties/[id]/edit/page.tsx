import { notFound, redirect } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { FormNavigation } from "@/components/common/form-navigation";
import { formCardClass } from "@/components/ui/form-kit";
import { PropertyForm, formatDateForInput, propertyFormSections } from "@/features/properties";
import { canWriteProperty } from "@/features/properties/lib/property-scope";
import { getProperty, getPropertyOptions } from "@/features/properties/queries/property.queries";
import type { PropertyInput } from "@/features/properties/schemas/property.schema";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("properties.update");
  const { id } = await params;
  const [data, options, canWrite] = await Promise.all([
    getProperty(id),
    getPropertyOptions(),
    canWriteProperty(context, id),
  ]);
  if (!data) notFound();
  // Visible but outside the user's data scope: the save would be refused.
  if (!canWrite) redirect("/forbidden");
  const r = data.record;
  const initial: Partial<PropertyInput> = {
    developmentId: r.developmentId,
    title: r.title,
    description: r.description,
    propertyType: r.propertyType as PropertyInput["propertyType"],
    listingType: r.listingType as PropertyInput["listingType"],
    status: r.status as PropertyInput["status"],
    currency: r.currency,
    parkingSpaces: r.parkingSpaces,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    barangay: r.barangay,
    city: r.city,
    province: r.province,
    postalCode: r.postalCode,
    latitude: r.latitude ? Number(r.latitude) : null,
    longitude: r.longitude ? Number(r.longitude) : null,
    listedAt: formatDateForInput(r.listedAt),
    availableFrom: formatDateForInput(r.availableFrom),
    contractStartDate: formatDateForInput(r.contractStartDate),
    contractEndDate: formatDateForInput(r.contractEndDate),
    floorCount: r.floorCount,
    unitsPerFloor: r.unitsPerFloor,
    unitIdentifierStyle: r.unitIdentifierStyle,
    features: data.features.map((v) => v.name).join(", "),
  };
  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title={`Edit ${r.title}`}
        description="Update this property."
        actions={<BackButton fallbackHref={`/properties/${id}`} label="Back to property" />}
      />
      <div className="mt-4 flex gap-6 [&>aside]:w-48">
        <FormNavigation sections={propertyFormSections} />
        <div className={formCardClass}>
          <PropertyForm
            propertyId={id}
            options={options}
            initial={initial}
            // A property without floors gets them here; afterwards floors are added one by one.
          />
        </div>
      </div>
    </PageContainer>
  );
}
