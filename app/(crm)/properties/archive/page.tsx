import Link from "next/link";
import { Archive } from "lucide-react";
import { BackButton } from "@/components/common/back-button";
import { FilterForm } from "@/components/common/filter-form";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { label, RestorePropertyButton } from "@/features/properties";
import { listArchivedProperties } from "@/features/properties/queries/property.queries";
import { formatDate } from "@/features/contacts/lib/helpers";
import { requirePagePermission } from "@/lib/permissions/authorization";

export const metadata = { title: "Archived properties" };

export default async function ArchivedPropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  await requirePagePermission("properties.delete");
  const q = await searchParams;
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const data = await listArchivedProperties({ page, search: q.search });

  const pageHref = (target: number) =>
    `/properties/archive?${new URLSearchParams({
      ...(q.search ? { search: q.search } : {}),
      page: String(target),
    }).toString()}`;

  return (
    <PageContainer>
      <PageHeader
        title="Archived properties"
        description="Restore to bring one back"
        actions={<BackButton fallbackHref="/properties" label="Back to properties" />}
      />
      <div className="mt-6 rounded-xl border border-border bg-card">
        <FilterForm className="border-b border-border/40 p-4">
          <Input
            name="search"
            defaultValue={q.search}
            placeholder="Search archived properties"
            aria-label="Search archived properties"
            className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-sm"
          />
        </FilterForm>

        {data.rows.length === 0 ? (
          <div className="py-16">
            <EmptyState icon={Archive} title={q.search ? "No matches" : "No archived properties"} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="w-full text-left text-sm">
              <TableHeader className="bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <TableRow>
                  <TableHead className="px-4 py-3">Property</TableHead>
                  <TableHead className="hidden px-4 py-3 sm:table-cell">Type</TableHead>
                  <TableHead className="hidden px-4 py-3 md:table-cell">Location</TableHead>
                  <TableHead className="hidden px-4 py-3 md:table-cell">Archived</TableHead>
                  <TableHead className="w-40 px-4 py-3 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/40">
                {data.rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/30">
                    <TableCell className="px-4 py-3">
                      <p className="font-medium text-foreground">{row.title}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{row.code}</p>
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {label(row.type)}
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {[row.city, row.province].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {row.archivedAt ? formatDate(row.archivedAt) : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex justify-end">
                        <RestorePropertyButton propertyId={row.id} />
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
            {data.total} archived {data.total === 1 ? "property" : "properties"}
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
            <span>
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
