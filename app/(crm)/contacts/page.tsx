import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { ContactPageActions } from "@/features/contacts/components/contact-page-actions";
import { ContactsPageWrapper } from "./contacts-page-wrapper";
import {
  listContacts,
  getBrokers,
  isContactSortKey,
} from "@/features/contacts/queries/contact.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { contactPageActions } from "@/features/contacts/lib/contact-page-actions";

const PAGE_SIZES = [10, 25, 50, 100];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    lifecycle?: string;
    employment?: string;
    broker?: string;
    sort?: string;
    dir?: string;
    pageSize?: string;
    cols?: string;
  }>;
}) {
  const q = await searchParams;
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const pageSize = PAGE_SIZES.includes(Number(q.pageSize)) ? Number(q.pageSize) : 20;
  const sort = isContactSortKey(q.sort) ? q.sort : undefined;
  const dir = q.dir === "asc" || q.dir === "desc" ? q.dir : undefined;
  const showAdditionalColumns = q.cols === "1";
  const context = await requirePagePermission("contacts.view");
  const actions = contactPageActions(context);
  const [data, brokers] = await Promise.all([
    listContacts({
      page,
      search: q.search,
      lifecycle: q.lifecycle,
      employment: q.employment,
      broker: q.broker,
      sort,
      dir,
      pageSize,
    }),
    getBrokers(),
  ]);
  const preservedParams = new URLSearchParams();
  if (sort) preservedParams.set("sort", sort);
  if (dir) preservedParams.set("dir", dir);
  if (showAdditionalColumns) preservedParams.set("cols", "1");
  if (pageSize !== 20) preservedParams.set("pageSize", String(pageSize));
  const preservedQuery = preservedParams.toString();

  return (
    <PageContainer>
      <PageHeader
        title="Contacts & leads"
        description="Your clients and leads."
        actions={
          // The archive page needs contacts.delete; without it the link only leads to Access denied.
          <ContactPageActions
            canArchive={actions.canArchive}
            canImport={actions.canImport}
            canExport={actions.canExport}
            canCreate={actions.canCreate}
          />
        }
      />
      {/* Phones: room below the list so the round Add button never covers the last row. */}
      <Card className="max-sm:mb-20 sm:mt-6">
        <ContactsPageWrapper
          data={data}
          brokers={brokers}
          canCreate={actions.canCreate}
          canEdit={actions.canEdit}
          canViewDocuments={actions.canViewDocuments}
          canArchive={actions.canArchive}
          canReassign={actions.canReassign}
          isSuperAdmin={actions.canOverrideWonLock}
          search={q.search}
          lifecycle={q.lifecycle}
          employment={q.employment}
          broker={q.broker}
          preservedQuery={preservedQuery}
          pageSize={pageSize}
          sort={sort}
          dir={dir}
          showAdditionalColumns={showAdditionalColumns}
        />
      </Card>
    </PageContainer>
  );
}
