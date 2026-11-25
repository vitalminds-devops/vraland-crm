import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
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
import { CampaignRowActions } from "@/features/marketing/components/campaign-actions";
import { CampaignFilters } from "@/features/marketing/components/campaign-filters";
import { ListPagination } from "@/features/marketing/components/list-pagination";
import {
  CampaignStatusBadge,
  ChannelBadge,
} from "@/features/marketing/components/marketing-badges";
import { MarketingNav } from "@/features/marketing/components/marketing-nav";
import {
  DEFAULT_MARKETING_PAGE_SIZE,
  MARKETING_PAGE_SIZES,
} from "@/features/marketing/lib/marketing-meta";
import { listCampaigns } from "@/features/marketing/queries/marketing.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    channel?: string;
  }>;
}) {
  const query = await searchParams;
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = (MARKETING_PAGE_SIZES as readonly number[]).includes(Number(query.pageSize))
    ? Number(query.pageSize)
    : DEFAULT_MARKETING_PAGE_SIZE;
  const context = await requirePagePermission("marketing.view");
  const canManage = context.permissions.has("marketing.manage");
  const canSend = context.permissions.has("marketing.send");
  const canDelete = context.permissions.has("marketing.delete");
  const data = await listCampaigns({
    page,
    pageSize,
    search: query.search,
    status: query.status,
    channel: query.channel,
  });
  const hasFilters = Boolean(query.search || query.status || query.channel);

  const preserved = new URLSearchParams();
  if (query.search) preserved.set("search", query.search);
  if (query.status) preserved.set("status", query.status);
  if (query.channel) preserved.set("channel", query.channel);
  if (pageSize !== DEFAULT_MARKETING_PAGE_SIZE) preserved.set("pageSize", String(pageSize));
  const preservedQuery = preserved.toString();

  return (
    <PageContainer>
      <PageHeader
        title="Campaigns"
        description="Send messages to your contacts."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BackButton fallbackHref="/marketing" label="Back to marketing" />
            {canManage ? (
              <ButtonLink href="/marketing/campaigns/new" variant="primary" className="gap-2">
                <Plus aria-hidden="true" className="size-4" />
                Add campaign
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <MarketingNav current="/marketing/campaigns" />

      <Card>
        <CardToolbar>
          <CampaignFilters
            search={query.search}
            status={query.status}
            channel={query.channel}
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
                        Campaign
                      </TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">
                        Channel
                      </TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">
                        Status
                      </TableHead>
                      <TableHead scope="col" className="px-4 py-3 font-medium">
                        Sent
                      </TableHead>
                      <TableHead scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                        Scheduled
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
                    {data.rows.map((campaign) => {
                      const percent = campaign.recipientCount
                        ? Math.round((campaign.sentCount / campaign.recipientCount) * 100)
                        : 0;
                      return (
                        <TableRow key={campaign.id} className="transition-colors hover:bg-muted/30">
                          <TableCell className="px-4 py-3">
                            <Link
                              href={`/marketing/campaigns/${campaign.id}`}
                              className="font-medium hover:text-primary"
                            >
                              {campaign.name}
                            </Link>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {campaign.emailTemplateName ??
                                campaign.smsTemplateName ??
                                "No message template"}
                            </p>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <ChannelBadge channel={campaign.channel} />
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <CampaignStatusBadge status={campaign.status} />
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <p className="text-sm tabular-nums">
                              {campaign.sentCount.toLocaleString()} /{" "}
                              {campaign.recipientCount.toLocaleString()} sent
                            </p>
                            <div
                              className="mt-1.5 h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted"
                              aria-hidden="true"
                            >
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            {campaign.failedCount > 0 ? (
                              <p className="mt-1 text-[11px] text-destructive">
                                {campaign.failedCount.toLocaleString()} failed
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="hidden px-4 py-3 text-xs text-muted-foreground lg:table-cell">
                            {campaign.scheduledAt
                              ? formatDateTime(campaign.scheduledAt)
                              : "Not scheduled"}
                          </TableCell>
                          <TableCell className="hidden px-4 py-3 text-xs text-muted-foreground xl:table-cell">
                            {formatDateTime(campaign.createdAt)}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <CampaignRowActions
                              id={campaign.id}
                              name={campaign.name}
                              status={campaign.status}
                              channel={campaign.channel}
                              canManage={canManage}
                              canSendMessages={canSend}
                              canDeleteCampaign={canDelete}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <ListPagination
                page={data.page}
                pages={data.pages}
                pageSize={data.pageSize}
                basePath="/marketing/campaigns"
                preservedQuery={preservedQuery}
              />
            </>
          ) : (
            <EmptyState
              icon={Megaphone}
              title={hasFilters ? "No campaigns match" : "No campaigns yet"}
              description={
                hasFilters
                  ? undefined
                  : "Pick a template and the contacts to send it to. Make a template first if you have none."
              }
              action={
                hasFilters ? (
                  <ButtonLink href="/marketing/campaigns" variant="secondary">
                    Clear filters
                  </ButtonLink>
                ) : canManage ? (
                  <ButtonLink href="/marketing/campaigns/new" variant="primary" className="gap-2">
                    <Plus aria-hidden="true" className="size-4" />
                    Add campaign
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
