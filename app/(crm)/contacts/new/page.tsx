import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { FormNavigation } from "@/components/common/form-navigation";
import { formCardClass } from "@/components/ui/form-kit";
import { ContactForm, contactFormSections } from "@/features/contacts";
import { getContactOptions } from "@/features/contacts/queries/contact.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { getCurrentUser } from "@/lib/permissions/authorization";
export default async function NewContactPage() {
  const context = await requirePagePermission("contacts.create");
  const user = await getCurrentUser();
  const options = await getContactOptions();
  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Add contact"
        description="Add a contact."
        actions={<BackButton fallbackHref="/contacts" label="Back to contacts" />}
      />
      <div className="mt-6 flex gap-8">
        <FormNavigation
          sections={contactFormSections
            .filter((section) => section.id === "section-1" || section.id === "section-4")
            .map((section, index) => ({
              ...section,
              label: `${index + 1}. ${section.id === "section-1" ? "Details" : "Deal"}`,
            }))}
        />
        <div className={formCardClass}>
          <ContactForm
            options={options}
            canCreateDeal={options.canCreateDeal}
            currentUserId={user.id}
            currentRoles={context.roles}
          />
        </div>
      </div>
    </PageContainer>
  );
}
