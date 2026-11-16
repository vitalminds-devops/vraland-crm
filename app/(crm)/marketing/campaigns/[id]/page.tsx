import { notFound } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { RecordTable, RecordTd, RecordTh } from "@/components/common/record-table";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { TableBody, TableRow } from "@/components/ui/table";
import { EmptyCardState } from "@/features/contacts/components/empty-card-state";
import { formatDateTime } from "@/features/contacts/lib/helpers";
import { CampaignHeaderActions } from "@/features/marketing/components/campaign-actions";
import {
  CampaignStatusBadge,
  ChannelBadge,
  RecipientStatusBadge,
} from "@/features/marketing/components/marketing-badges";
import { MarketingNav } from "@/features/marketing/components/marketing-nav";
import {
  MarketingInfo,
  MarketingSection,
  MarketingStat,
} from "@/features/marketing/components/marketing-section";
import { campaignStatusLabel, channelLabel } from "@/features/marketing/lib/marketing-meta";
import { RECIPIENT_PAGE_SIZE, getCampaign } from "@/features/marketing/queries/marketing.queries";
import { ButtonLink } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const context = await requirePagePermission("marketing.view");
  const { id } = await params;
  const page = Math.max(1, Math.floor(Number((await searchParams).page) || 1));
  const data = await getCampaign(id, page);
  if (!data) notFound();

  const campaign = data.record;
  const total = data.recipientTotal;
  const pages = Math.max(1, Math.ceil(total / RECIPIENT_PAGE_SIZE));
  const count = (status: string) => data.statusCounts[status] ?? 0;
  const sent = count("sent") + count("delivered") + count("opened") + count("clicked");
  const delivered = count("delivered") + count("opened") + count("clicked");
  const opened = count("opened") + count("clicked");
  const clicked = count("clicked");
  const failed = count("failed");
  const percent = (value: number) =>
    total ? `${Math.round((value / total) * 100)}% of recipients` : "—";
  const templateName = campaign.channel === "sms" ? data.smsTemplateName : data.emailTemplateName;

  return (
    <PageContainer>
      <PageHeader
        title={campaign.name}
        description={`${channelLabel(campaign.channel)} · ${campaignStatusLabel(campaign.status)} · ${total.toLocaleString()} recipient${total === 1 ? "" : "s"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BackButton fallbackHref="/marketing/campaigns" label="Back to campaigns" />
            <CampaignHeaderActions
              id={campaign.id}
              name={campaign.name}
              status={campaign.status}
              channel={campaign.channel}
              canManage={context.permissions.has("marketing.manage")}
              canSendMessages={context.permissions.has("marketing.send")}
              canDeleteCampaign={context.permissions.has("marketing.delete")}
            />
          </div>
        }
      />

      <MarketingNav current="/marketing/campaigns" />

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <MarketingStat label="Recipients" value={total.toLocaleString()} />
        <MarketingStat label="Sent" value={sent.toLocaleString()} detail={percent(sent)} />
        <MarketingStat
          label="Delivered"
          value={delivered.toLocaleString()}
          detail={percent(delivered)}
        />
        <MarketingStat label="Opened" value={opened.toLocaleString()} detail={percent(opened)} />
        <MarketingStat label="Clicked" value={clicked.toLocaleString()} detail={percent(clicked)} />
        <MarketingStat
          label="Failed"
          value={failed.toLocaleString()}
          detail={failed ? "See errors below." : "No failures."}
        />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <MarketingSection title="Delivery">
          {data.recipients.length ? (
            <RecordTable
              head={
                <TableRow>
                  <RecordTh>Recipient</RecordTh>
                  <RecordTh className="hidden md:table-cell">Address</RecordTh>
                  <RecordTh>Status</RecordTh>
                  <RecordTh className="hidden lg:table-cell">Sent</RecordTh>
                  <RecordTh className="hidden lg:table-cell">Delivered</RecordTh>
                  <RecordTh className="hidden xl:table-cell">Opened</RecordTh>
                  <RecordTh className="hidden xl:table-cell">Clicked</RecordTh>
                  <RecordTh className="hidden md:table-cell">Error</RecordTh>
                </TableRow>
              }
              footer={
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {`${total.toLocaleString()} recipient${total === 1 ? "" : "s"} · ${failed.toLocaleString()} failed`}
                    {pages > 1 ? ` · Page ${page} of ${pages}` : ""}
                  </span>
                  {pages > 1 && (
                    <span className="flex gap-2">
                      {page > 1 && (
                        <ButtonLink href={`?page=${page - 1}`} variant="secondary" size="sm">
                          Previous
                        </ButtonLink>
                      )}
                      {page < pages && (
                        <ButtonLink href={`?page=${page + 1}`} variant="secondary" size="sm">
                          Next
                        </ButtonLink>
                      )}
                    </span>
                  )}
                </div>
              }
            >
              <TableBody className="divide-y divide-border/40">
                {data.recipients.map((recipient) => (
                  <TableRow
                    key={recipient.contactId}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <RecordTd>
                      {recipient.firstName} {recipient.lastName}
                    </RecordTd>
                    <RecordTd className="hidden md:table-cell">
                      {campaign.channel === "sms"
                        ? (recipient.mobilePhone ?? "—")
                        : (recipient.email ?? "—")}
                    </RecordTd>
                    <RecordTd>
                      <RecipientStatusBadge status={recipient.status} />
                    </RecordTd>
                    <RecordTd className="hidden text-xs text-muted-foreground lg:table-cell">
                      {recipient.sentAt ? formatDateTime(recipient.sentAt) : "—"}
                    </RecordTd>
                    <RecordTd className="hidden text-xs text-muted-foreground lg:table-cell">
                      {recipient.deliveredAt ? formatDateTime(recipient.deliveredAt) : "—"}
                    </RecordTd>
                    <RecordTd className="hidden text-xs text-muted-foreground xl:table-cell">
                      {recipient.openedAt ? formatDateTime(recipient.openedAt) : "—"}
                    </RecordTd>
                    <RecordTd className="hidden text-xs text-muted-foreground xl:table-cell">
                      {recipient.clickedAt ? formatDateTime(recipient.clickedAt) : "—"}
                    </RecordTd>
                    <RecordTd className="hidden max-w-48 truncate text-xs text-destructive md:table-cell">
                      {recipient.error ?? "—"}
                    </RecordTd>
                  </TableRow>
                ))}
              </TableBody>
            </RecordTable>
          ) : (
            <EmptyCardState message="No recipients." />
          )}
        </MarketingSection>

        <MarketingSection title="Details">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <MarketingInfo label="Channel" value={<ChannelBadge channel={campaign.channel} />} />
            <MarketingInfo
              label="Status"
              value={<CampaignStatusBadge status={campaign.status} />}
            />
            <MarketingInfo label="Template" value={templateName ?? "—"} />
            <MarketingInfo
              label="Scheduled"
              value={campaign.scheduledAt ? formatDateTime(campaign.scheduledAt) : "Not scheduled"}
            />
            <MarketingInfo
              label="Started"
              value={campaign.startedAt ? formatDateTime(campaign.startedAt) : "—"}
            />
            <MarketingInfo
              label="Completed"
              value={campaign.completedAt ? formatDateTime(campaign.completedAt) : "—"}
            />
            <MarketingInfo label="Created" value={formatDateTime(campaign.createdAt)} />
            <MarketingInfo label="Updated" value={formatDateTime(campaign.updatedAt)} />
            <MarketingInfo label="Created by" value={data.creatorName ?? "—"} />
          </dl>
        </MarketingSection>
      </div>
    </PageContainer>
  );
}
