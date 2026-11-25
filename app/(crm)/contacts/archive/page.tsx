import Link from "next/link";
import { Archive, Search } from "lucide-react";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { FilterForm } from "@/components/common/filter-form";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RestoreContactButton,
  LifecycleBadge,
  formatContactName,
  formatDate,
} from "@/features/contacts";
import {
  listArchivedContacts,
  listRestoreAgents,
} from "@/features/contacts/queries/contact.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

const PAGE_SIZES = [10, 25, 50, 100];

export default async function ArchivedContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    pageSize?: string;
  }>;
}) {
  await requirePagePermission("contacts.delete");
  const q = await searchParams;
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const pageSize = PAGE_SIZES.includes(Number(q.pageSize)) ? Number(q.pageSize) : 25;
  const [data, agents] = await Promise.all([
    listArchivedContacts({ page, search: q.search, pageSize }),
    listRestoreAgents(),
  ]);

  const pageHref = (target: number) =>
    `/contacts/archive?${new URLSearchParams({
      ...(q.search ? { search: q.search } : {}),
      pageSize: String(pageSize),
      page: String(target),
    }).toString()}`;

  return (
    <PageContainer>
      <PageHeader
        title="Archived contacts"
        description="Restore to bring one back"
        actions={<BackButton fallbackHref="/contacts" label="Back to contacts" />}
      />
      <div className="rounded-xl border border-border bg-card sm:mt-6">
        <FilterForm className="flex flex-col gap-2 border-b border-border/40 p-4 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              name="search"
              defaultValue={q.search}
              placeholder="Search archived contacts"
              aria-label="Search archived contacts"
              className="h-9 w-full rounded-lg border border-border/60 bg-background pr-3 pl-9 text-base sm:text-sm"
            />
          </label>
          <NativeSelect
            name="pageSize"
            defaultValue={String(pageSize)}
            aria-label="Rows per page"
            wrapperClassName="max-sm:hidden"
            className="h-9 rounded-lg border border-border/60 bg-background px-3 text-sm"
          >
            {PAGE_SIZES.map((size) => (
              <NativeSelectOption key={size} value={size}>
                {size} per page
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FilterForm>

        {data.rows.length === 0 ? (
          <div className="py-16">
            <EmptyState icon={Archive} title={q.search ? "No matches" : "No archived contacts"} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="w-full text-left text-sm">
              <TableHeader className="bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground max-sm:hidden">
                <TableRow>
                  <TableHead className="px-4 py-3">Contact</TableHead>
                  <TableHead className="hidden px-4 py-3 sm:table-cell">Code</TableHead>
                  <TableHead className="hidden px-4 py-3 md:table-cell">Lifecycle</TableHead>
                  <TableHead className="hidden px-4 py-3 lg:table-cell">Agent</TableHead>
                  <TableHead className="hidden px-4 py-3 md:table-cell">Archived</TableHead>
                  <TableHead className="w-40 px-4 py-3 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/40">
                {data.rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/30">
                    <TableCell className="px-4 py-3">
                      <p className="font-medium text-foreground">{formatContactName(row)}</p>
                      {/* Phones hide the Code column, so the code shows here instead of "No email". */}
                      <p className="text-xs text-muted-foreground">
                        <span className="sm:hidden">
                          {row.contactCode}
                          {row.email && ` · ${row.email}`}
                        </span>
                        <span className="max-sm:hidden">{row.email || "No email"}</span>
                      </p>
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {row.contactCode}
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 md:table-cell">
                      <LifecycleBadge value={row.lifecycleStage} />
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {[row.assignedFirstName, row.assignedLastName].filter(Boolean).join(" ") ||
                        "Unassigned"}
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {row.deletedAt ? formatDate(row.deletedAt) : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex justify-end">
                        {row.expiredAt ? (
                          <span
                            className="text-xs text-muted-foreground"
                            title="Expired after 30 days in Leads"
                          >
                            Expired
                          </span>
                        ) : (
                          <RestoreContactButton contactId={row.id} agents={agents} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 p-4 text-sm text-muted-foreground">
          <span>
            {data.total} archived {data.total === 1 ? "contact" : "contacts"}
          </span>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="rounded-md border border-border/60 px-3 py-1.5 hover:bg-muted/60"
              >
                Previous
              </Link>
            )}
            <span className={data.pages <= 1 ? "max-sm:hidden" : undefined}>
              Page {page} of {data.pages}
            </span>
            {page < data.pages && (
              <Link
                href={pageHref(page + 1)}
                className="rounded-md border border-border/60 px-3 py-1.5 hover:bg-muted/60"
              >
                Next
              </Link>
            )}
          </div>
        </footer>
      </div>
    </PageContainer>
  );
}
