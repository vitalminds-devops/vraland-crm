import Link from "next/link";
import { MessageSquare, Plus } from "lucide-react";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardToolbar } from "@/components/ui/card";
import { DotBadge } from "@/components/ui/dot-badge";
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
import { MarketingNav } from "@/features/marketing/components/marketing-nav";
import { TemplateFilters } from "@/features/marketing/components/template-filters";
import { TemplateToggle } from "@/features/marketing/components/template-toggle";
import {
  DEFAULT_MARKETING_PAGE_SIZE,
  MARKETING_PAGE_SIZES,
} from "@/features/marketing/lib/marketing-meta";
import {
  getTemplateCategories,
  listSmsTemplates,
} from "@/features/marketing/queries/marketing.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function SmsTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    category?: string;
    active?: string;
  }>;
}) {
  const query = await searchParams;
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = (MARKETING_PAGE_SIZES as readonly number[]).includes(Number(query.pageSize))
    ? Number(query.pageSize)
    : DEFAULT_MARKETING_PAGE_SIZE;
  const context = await requirePagePermission("marketing.view");
  const canManage = context.permissions.has("marketing.manage");
  const [data, categories] = await Promise.all([
    listSmsTemplates({
      page,
      pageSize,
      search: query.search,
      category: query.category,
      active: query.active,
    }),
    getTemplateCategories(),
  ]);
  const hasFilters = Boolean(query.search || query.category || query.active);

  const preserved = new URLSearchParams();
  if (query.search) preserved.set("search", query.search);
  if (query.category) preserved.set("category", query.category);
  if (query.active) preserved.set("active", query.active);
  if (pageSize !== DEFAULT_MARKETING_PAGE_SIZE) preserved.set("pageSize", String(pageSize));
  const preservedQuery = preserved.toString();

  return (
    <PageContainer>
      <PageHeader
        title="SMS templates"
        description="Reusable text messages."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BackButton fallbackHref="/marketing" label="Back to marketing" />
            {canManage ? (
              <ButtonLink href="/marketing/sms-templates/new" variant="primary" className="gap-2">
                <Plus aria-hidden="true" className="size-4" />
                New SMS template
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <MarketingNav current="/marketing/sms-templates" />

      <Card>
        <CardToolbar>
          <TemplateFilters
            type="sms"
            search={query.search}
            category={query.category}
            active={query.active}
            categories={categories.sms}
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
                        Template
                      </TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">
                        Category
                      </TableHead>
                      <TableHead
                        scope="col"
                        className="hidden px-4 py-3 text-right font-medium md:table-cell"
                      >
                        Characters
                      </TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">
                        Status
                      </TableHead>
                      <TableHead scope="col" className="hidden px-4 py-3 font-medium xl:table-cell">
                        Updated
                      </TableHead>
                      <TableHead scope="col" className="px-4 py-3">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/40">
                    {data.rows.map((template) => (
                      <TableRow key={template.id} className="transition-colors hover:bg-muted/30">
                        <TableCell className="px-4 py-3">
                          <Link
                            href={`/marketing/sms-templates/${template.id}`}
                            className="font-medium hover:text-primary"
                          >
                            {template.name}
                          </Link>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {template.body}
                          </p>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                          {template.category || "Uncategorized"}
                        </TableCell>
                        <TableCell className="hidden px-4 py-3 text-right text-xs tabular-nums md:table-cell">
                          {template.body.length.toLocaleString()}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <DotBadge tone={template.isActive ? "green" : "gray"}>
                            {template.isActive ? "Active" : "Inactive"}
                          </DotBadge>
                        </TableCell>
                        <TableCell className="hidden px-4 py-3 text-xs text-muted-foreground xl:table-cell">
                          {formatDateTime(template.updatedAt)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <ButtonLink
                              href={`/marketing/sms-templates/${template.id}`}
                              variant="secondary"
                              size="sm"
                            >
                              View
                            </ButtonLink>
                            {canManage ? (
                              <TemplateToggle
                                type="sms"
                                id={template.id}
                                name={template.name}
                                active={template.isActive}
                              />
                            ) : null}
                          </div>
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
                basePath="/marketing/sms-templates"
                preservedQuery={preservedQuery}
              />
            </>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title={hasFilters ? "No templates match" : "No SMS templates yet"}
              description={
                hasFilters
                  ? undefined
                  : "Write a text message once, then reuse it in campaigns and follow-ups."
              }
              action={
                hasFilters ? (
                  <ButtonLink href="/marketing/sms-templates" variant="secondary">
                    Clear filters
                  </ButtonLink>
                ) : canManage ? (
                  <ButtonLink
                    href="/marketing/sms-templates/new"
                    variant="primary"
                    className="gap-2"
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    New SMS template
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
