import { notFound } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { FormNavigation } from "@/components/common/form-navigation";
import { formCardClass } from "@/components/ui/form-kit";
import { ContactForm, contactFormSections, formatContactName } from "@/features/contacts";
import { getContact, getContactOptions } from "@/features/contacts/queries/contact.queries";
import type { ContactInput } from "@/features/contacts/schemas/contact.schema";
import type { ContactDealInput } from "@/features/deals/schemas/deal.schema";
import { requirePagePermission, getCurrentUser } from "@/lib/permissions/authorization";
export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("contacts.update");
  const user = await getCurrentUser();
  const { id } = await params;
  const [contact, options] = await Promise.all([getContact(id), getContactOptions()]);
  if (!contact) notFound();
  const r = contact.record;
  const initial: Partial<ContactInput> = {
    firstName: r.firstName,
    middleName: r.middleName,
    lastName: r.lastName,
    companyName: r.companyName,
    birthDate: r.birthDate,
    gender: r.gender as ContactInput["gender"],
    civilStatus: r.civilStatus as ContactInput["civilStatus"],
    citizenship: r.citizenship,
    landline: r.landline,
    prcLicenseNumber: r.prcLicenseNumber,
    currentAddressLine1: r.currentAddressLine1,
    currentBarangay: r.currentBarangay,
    currentCity: r.currentCity,
    currentProvince: r.currentProvince,
    currentPostalCode: r.currentPostalCode,
    currentCountry: r.currentCountry,
    email: r.email,
    mobilePhone1: r.mobilePhone1,
    mobilePhone2: r.mobilePhone2,
    mobilePhone3: r.mobilePhone3,
    whatsappNumber: r.whatsappNumber,
    viberNumber: r.viberNumber,
    instagramHandle: r.instagramHandle,
    facebookHandle: r.facebookHandle,
    employmentType: r.employmentType as ContactInput["employmentType"],
    annualIncome: r.annualIncome ? Number(r.annualIncome) : null,
    lifecycleStage: r.lifecycleStage as ContactInput["lifecycleStage"],
    agentUserId: r.agentUserId ?? "",
    purchaseType: r.purchaseType as ContactInput["purchaseType"],
    financingPreference: r.financingPreference as ContactInput["financingPreference"],
    financingPreferenceOther: r.financingPreferenceOther,
    bankName: r.bankName,
    preferredContactMethods: r.preferredContactMethods as ContactInput["preferredContactMethods"],
    budgetMin: r.budgetMin ? Number(r.budgetMin) : null,
    budgetMax: r.budgetMax ? Number(r.budgetMax) : null,
    preferredDevelopmentId: r.preferredDevelopmentId ?? undefined,
    preferredUnitIds: r.preferredUnitIds,
    notes: r.notes,
    marketingConsent: r.marketingConsent,
  };
  const initialDeal = contact.deal
    ? {
        dealType: contact.deal.dealType as ContactDealInput["dealType"],
        stageId: contact.deal.stageId,
        amount: contact.deal.amount ?? "",
        expectedCommission: contact.deal.expectedCommission ?? "",
        expectedCloseDate: contact.deal.expectedCloseDate ?? "",
      }
    : null;
  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title={`Edit ${formatContactName(r)}`}
        description="Update this contact."
        actions={<BackButton fallbackHref={`/contacts/${id}`} label="Back to contact" />}
      />
      <div className="mt-6 flex gap-8">
        <FormNavigation sections={contactFormSections} />
        <div className={formCardClass}>
          <ContactForm
            contactId={id}
            options={options}
            initial={initial}
            initialDeal={initialDeal}
            canCreateDeal={options.canCreateDeal}
            canUpdateDeal={context.permissions.has("deals.update")}
            currentUserId={user.id}
            currentRoles={context.roles}
          />
        </div>
      </div>
    </PageContainer>
  );
}
