import Link from "next/link";
import { Columns3, Download, Search } from "lucide-react";
import { FilterForm } from "@/components/common/filter-form";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { ButtonLink, buttonVariants } from "@/components/ui/button";
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
import { listDeals } from "@/features/deals/queries/deal.queries";
import { dealLabel, dealTypeLabel } from "@/features/deals/lib/deal-label";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { hasPermission } from "@/lib/permissions/policy";
export default async function DealListPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    stage?: string;
  }>;
}) {
  const context = await requirePagePermission("deals.view");
  const canExport = hasPermission(context, "deals.export");
  const q = await searchParams;
  const page = Math.max(1, Number(q.page) || 1);
  const data = await listDeals({
    page,
    search: q.search,
    status: q.status,
    stage: q.stage,
  });
  const pageHref = (target: number) =>
    `/pipeline/list?${new URLSearchParams({
      ...(q.search ? { search: q.search } : {}),
      ...(q.stage ? { stage: q.stage } : {}),
      ...(q.status ? { status: q.status } : {}),
      page: String(target),
    }).toString()}`;
  return (
    <PageContainer>
      <PageHeader
        title="Opportunity list"
        description="Every lead and opportunity."
        actions={
          <div className="flex flex-wrap gap-2">
            {canExport && (
              <a
                href={`/api/deals/export?${new URLSearchParams({
                  ...(q.search ? { search: q.search } : {}),
                  ...(q.stage ? { stage: q.stage } : {}),
                  ...(q.status ? { status: q.status } : {}),
                }).toString()}`}
                className={buttonVariants({ variant: "secondary" })}
              >
                <Download aria-hidden="true" className="size-4" />
                Export
              </a>
            )}
            <ButtonLink href="/pipeline" variant="secondary">
              <Columns3 className="size-4" />
              Kanban
            </ButtonLink>
          </div>
        }
      />
      <div className="mt-6 rounded-xl border bg-card">
        <FilterForm className="flex flex-col gap-2 border-b p-4 md:flex-row">
          <label className="relative min-w-0 md:flex-1">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              name="search"
              defaultValue={q.search}
              placeholder="Search development or code"
              aria-label="Search opportunities"
              className={`${input} pl-9`}
            />
          </label>
          <NativeSelect
            name="stage"
            aria-label="Stage"
            defaultValue={q.stage}
            className={`${input} pr-9`}
            wrapperClassName="md:w-48 md:shrink-0"
          >
            <NativeSelectOption value="">All stages</NativeSelectOption>
            {data.stages.map((v) => (
              <NativeSelectOption key={v.id} value={v.id}>
                {v.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            name="status"
            aria-label="Status"
            defaultValue={q.status}
            className={`${input} pr-9`}
            wrapperClassName="md:w-40 md:shrink-0"
          >
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            <NativeSelectOption value="open">Open</NativeSelectOption>
            <NativeSelectOption value="won">Won</NativeSelectOption>
            <NativeSelectOption value="lost">Lost</NativeSelectOption>
          </NativeSelect>
        </FilterForm>
        {data.rows.length ? (
          <>
            <div className="overflow-x-auto">
              <Table className="w-full text-left text-sm">
                <TableHeader className="bg-muted/60 text-xs uppercase text-muted-foreground">
                  <TableRow>
                    <TableHead className="px-4 py-3">Opportunity</TableHead>
                    <TableHead className="px-4 py-3">Stage</TableHead>
                    <TableHead className="px-4 py-3">Value</TableHead>
                    <TableHead className="px-4 py-3">Probability</TableHead>
                    <TableHead className="px-4 py-3">Agent</TableHead>
                    <TableHead className="px-4 py-3">Expected close</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {data.rows.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="px-4 py-3">
                        <Link href={`/deals/${d.id}`} className="font-medium hover:underline">
                          {dealLabel(d)}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {d.code} · {dealTypeLabel(d.dealType)}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-3">{d.stageName}</TableCell>
                      <TableCell className="px-4 py-3">{money(d.amount, d.currency)}</TableCell>
                      <TableCell className="px-4 py-3">{d.probability}%</TableCell>
                      <TableCell className="px-4 py-3">
                        {d.agentFirstName ? `${d.agentFirstName} ${d.agentLastName}` : "Unassigned"}
                      </TableCell>
                      <TableCell className="px-4 py-3">{d.expectedCloseDate || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-sm">
              <span>{data.total} opportunities</span>
              <div className="flex gap-2">
                {page > 1 && (
                  <ButtonLink href={pageHref(page - 1)} variant="secondary">
                    Previous
                  </ButtonLink>
                )}
                {page < data.pages && (
                  <ButtonLink href={pageHref(page + 1)} variant="secondary">
                    Next
                  </ButtonLink>
                )}
              </div>
            </footer>
          </>
        ) : (
          <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
            No opportunities match these filters.
          </div>
        )}
      </div>
    </PageContainer>
  );
}
const input = "rounded-md border bg-background px-3 py-2 text-sm";
const money = (v: string | null, c: string) =>
  v ? new Intl.NumberFormat("en-PH", { style: "currency", currency: c }).format(Number(v)) : "—";
