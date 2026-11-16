import Link from "next/link";
import { Plus, Workflow } from "lucide-react";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardToolbar } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { tableHeadClass } from "@/components/ui/table-parts";
import { formatDateTime } from "@/features/contacts/lib/helpers";
import { ListPagination } from "@/features/marketing/components/list-pagination";
import {
  SequenceStatusBadge,
  TriggerBadge,
} from "@/features/marketing/components/marketing-badges";
import { MarketingNav } from "@/features/marketing/components/marketing-nav";
import {
  DEFAULT_MARKETING_PAGE_SIZE,
  MARKETING_PAGE_SIZES,
} from "@/features/marketing/lib/marketing-meta";
import { SequenceFilters } from "@/features/marketing/components/sequence-filters";
import { listSequences } from "@/features/marketing/queries/marketing.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    active?: string;
    trigger?: string;
  }>;
}) {
  const query = await searchParams;
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = (MARKETING_PAGE_SIZES as readonly number[]).includes(Number(query.pageSize))
    ? Number(query.pageSize)
    : DEFAULT_MARKETING_PAGE_SIZE;
  const context = await requirePagePermission("marketing.view");
  const canManage = context.permissions.has("marketing.manage");
  const data = await listSequences({
    page,
    pageSize,
    search: query.search,
    active: query.active,
    trigger: query.trigger,
  });
  const hasFilters = Boolean(query.search || query.active || query.trigger);

  const preserved = new URLSearchParams();
  if (query.search) preserved.set("search", query.search);
  if (query.active) preserved.set("active", query.active);
  if (query.trigger) preserved.set("trigger", query.trigger);
  if (pageSize !== DEFAULT_MARKETING_PAGE_SIZE) preserved.set("pageSize", String(pageSize));
  const preservedQuery = preserved.toString();

  return (
    <PageContainer>
      <PageHeader
        title="Follow-ups"
        description="Messages sent to a person over days, step by step."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BackButton fallbackHref="/marketing" label="Back to marketing" />
            {canManage ? (
              <ButtonLink href="/marketing/automations/new" variant="primary" className="gap-2">
                <Plus aria-hidden="true" className="size-4" />
                New follow-up
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <MarketingNav current="/marketing/automations" />

      <Card>
        <CardToolbar>
          <SequenceFilters
            search={query.search}
            active={query.active}
            trigger={query.trigger}
            preservedQuery={preservedQuery}
          />
        </CardToolbar>
        <CardContent className="p-0">
          {data.rows.length ? (
            <>
              <div className="overflow-x-auto">
                <Table className="w-full text-left text-sm">
                  <TableHeader className={tableHeadClass}>
                    <TableRow>
                      <TableHead scope="col" className="px-4 py-3 font-medium">
                        Follow-up
                      </TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">
                        Trigger
                      </TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">
                        Status
                      </TableHead>
                      <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                        Steps
                      </TableHead>
                      <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                        People
                      </TableHead>
                      <TableHead scope="col" className="hidden px-4 py-3 font-medium xl:table-cell">
                        Created
                      </TableHead>
                      <TableHead scope="col" className="px-4 py-3">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/40">
                    {data.rows.map((sequence) => (
                      <TableRow key={sequence.id} className="transition-colors hover:bg-muted/30">
                        <TableCell className="px-4 py-3">
                          <Link
                            href={`/marketing/automations/${sequence.id}`}
                            className="font-medium hover:text-primary"
                          >
                            {sequence.name}
                          </Link>
                          {sequence.description ? (
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {sequence.description}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <TriggerBadge trigger={sequence.triggerType} />
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <SequenceStatusBadge isActive={sequence.isActive} />
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right text-sm tabular-nums">
                          {sequence.stepCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right text-sm tabular-nums">
                          {sequence.enrollmentCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="hidden px-4 py-3 text-xs text-muted-foreground xl:table-cell">
                          {formatDateTime(sequence.createdAt)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <ButtonLink
                            href={`/marketing/automations/${sequence.id}`}
                            variant="secondary"
                            size="sm"
                          >
                            View
                          </ButtonLink>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ListPagination
                page={data.page}
                pages={data.pages}
                pageSize={data.pageSize}
                basePath="/marketing/automations"
                preservedQuery={preservedQuery}
              />
            </>
          ) : (
            <EmptyState
              icon={Workflow}
              title={hasFilters ? "No follow-ups match" : "No follow-ups yet"}
              action={
                hasFilters ? (
                  <ButtonLink href="/marketing/automations" variant="secondary">
                    Clear filters
                  </ButtonLink>
                ) : canManage ? (
                  <ButtonLink href="/marketing/automations/new" variant="primary" className="gap-2">
                    <Plus aria-hidden="true" className="size-4" />
                    New follow-up
                  </ButtonLink>
                ) : undefined
              }
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
