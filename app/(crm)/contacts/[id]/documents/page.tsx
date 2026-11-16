import { notFound } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { RequirementChecklist, cardClass, formatContactName } from "@/features/contacts";
import { getContact } from "@/features/contacts/queries/contact.queries";
import { listContactRequirements } from "@/features/contacts/queries/requirement.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function ContactDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requirePagePermission("requirements.view");
  const data = await getContact(id);
  if (!data) notFound();
  const requirements = await listContactRequirements(id);
  return (
    <PageContainer>
      <PageHeader
        title="Documents"
        description={formatContactName(data.record)}
        actions={<BackButton fallbackHref={`/contacts/${id}`} label="Back to contact" />}
      />
      <section className={`mt-6 ${cardClass}`}>
        <RequirementChecklist
          contactId={id}
          requirements={requirements}
          canManage={context.permissions.has("requirements.manage")}
        />
      </section>
    </PageContainer>
  );
}
