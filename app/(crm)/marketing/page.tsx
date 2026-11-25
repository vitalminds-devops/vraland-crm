import Link from "next/link";
import { Mail, Megaphone, MessageSquare, Plus, Workflow } from "lucide-react";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ButtonLink } from "@/components/ui/button";
import { DotBadge } from "@/components/ui/dot-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyCardState } from "@/features/contacts/components/empty-card-state";
import { formatDateTime } from "@/features/contacts/lib/helpers";
import {
  CampaignStatusBadge,
  SequenceStatusBadge,
  TriggerBadge,
} from "@/features/marketing/components/marketing-badges";
import { MarketingNav } from "@/features/marketing/components/marketing-nav";
import { MarketingSection } from "@/features/marketing/components/marketing-section";
import {
  getMarketingSummary,
  listCampaigns,
  listSequences,
} from "@/features/marketing/queries/marketing.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function MarketingPage() {
  const context = await requirePagePermission("marketing.view");
  const canManage = context.permissions.has("marketing.manage");
  const [summary, campaigns, sequences] = await Promise.all([
    getMarketingSummary(),
    listCampaigns({ page: 1, pageSize: 5 }),
    listSequences({ page: 1, pageSize: 5 }),
  ]);

  const providers = [
    { label: "Email · Resend", value: summary.providers.email },
    { label: "SMS", value: summary.providers.sms },
    { label: "Social", value: summary.providers.social },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Marketing"
        description="1. Write a template · 2. Send it as a campaign, or 3. Send it over time with a follow-up."
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href="/marketing/automations/new" variant="secondary" className="gap-2">
                <Workflow aria-hidden="true" className="size-4" />
                Add follow-up
              </ButtonLink>
              <ButtonLink href="/marketing/campaigns/new" variant="primary" className="gap-2">
                <Plus aria-hidden="true" className="size-4" />
                Add campaign
              </ButtonLink>
            </div>
          ) : undefined
        }
      />

      <MarketingNav current="/marketing" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Campaigns"
          value={summary.campaigns.toLocaleString()}
          detail={`${summary.activeCampaigns.toLocaleString()} scheduled or running.`}
          icon={Megaphone}
          href="/marketing/campaigns"
        />
        <StatCard
          label="Follow-ups"
          value={summary.sequences.toLocaleString()}
          detail={`${summary.activeSequences.toLocaleString()} active.`}
          icon={Workflow}
          href="/marketing/automations"
        />
        <StatCard
          label="Email templates"
          value={summary.emailTemplates.toLocaleString()}
          detail="Reusable emails."
          icon={Mail}
          href="/marketing/email-templates"
        />
        <StatCard
          label="SMS templates"
          value={summary.smsTemplates.toLocaleString()}
          detail="Short text messages."
          icon={MessageSquare}
          href="/marketing/sms-templates"
        />
      </div>

      <div className="mt-6 space-y-6">
        <div className="flex min-w-0 flex-col gap-6">
          <MarketingSection
            title="Recent campaigns"
            action={
              <Link
                href="/marketing/campaigns"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            }
          >
            {campaigns.rows.length ? (
              <div className="overflow-x-auto">
                <Table className="w-full text-left text-sm">
                  <TableHeader className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <TableRow className="border-b border-border/50">
                      <TableHead className="pb-2 font-medium">Campaign</TableHead>
                      <TableHead className="pb-2 font-medium">Status</TableHead>
                      <TableHead className="pb-2 text-right font-medium">Sent</TableHead>
                      <TableHead className="hidden pb-2 text-right font-medium sm:table-cell">
                        Created
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/40">
                    {campaigns.rows.map((campaign) => (
                      <TableRow key={campaign.id} className="transition-colors hover:bg-muted/30">
                        <TableCell className="py-3 pr-4">
                          <Link
                            href={`/marketing/campaigns/${campaign.id}`}
                            className="font-medium hover:text-primary"
                          >
                            {campaign.name}
                          </Link>
                        </TableCell>
                        <TableCell className="py-3 pr-4">
                          <CampaignStatusBadge status={campaign.status} />
                        </TableCell>
                        <TableCell className="py-3 pr-4 text-right text-sm tabular-nums">
                          {campaign.sentCount.toLocaleString()} /{" "}
                          {campaign.recipientCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="hidden py-3 text-right text-xs text-muted-foreground sm:table-cell">
                          {formatDateTime(campaign.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyCardState
                message="No campaigns yet. A campaign sends one template to the contacts you pick."
                actionHref={canManage ? "/marketing/campaigns/new" : undefined}
                actionLabel="Create campaign"
              />
            )}
          </MarketingSection>

          <MarketingSection
            title="Recent follow-ups"
            action={
              <Link
                href="/marketing/automations"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            }
          >
            {sequences.rows.length ? (
              <div className="overflow-x-auto">
                <Table className="w-full text-left text-sm">
                  <TableHeader className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <TableRow className="border-b border-border/50">
                      <TableHead className="pb-2 font-medium">Follow-up</TableHead>
                      <TableHead className="pb-2 font-medium">Starts when</TableHead>
                      <TableHead className="pb-2 font-medium">Status</TableHead>
                      <TableHead className="pb-2 text-right font-medium">Steps</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/40">
                    {sequences.rows.map((sequence) => (
                      <TableRow key={sequence.id} className="transition-colors hover:bg-muted/30">
                        <TableCell className="py-3 pr-4">
                          <Link
                            href={`/marketing/automations/${sequence.id}`}
                            className="font-medium hover:text-primary"
                          >
                            {sequence.name}
                          </Link>
                        </TableCell>
                        <TableCell className="py-3 pr-4">
                          <TriggerBadge trigger={sequence.triggerType} />
                        </TableCell>
                        <TableCell className="py-3 pr-4">
                          <SequenceStatusBadge isActive={sequence.isActive} />
                        </TableCell>
                        <TableCell className="py-3 text-right text-sm tabular-nums">
                          {sequence.stepCount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyCardState
                message="No follow-ups yet. A follow-up sends messages over days, step by step."
                actionHref={canManage ? "/marketing/automations/new" : undefined}
                actionLabel="Create follow-up"
              />
            )}
          </MarketingSection>
        </div>

        <aside className="grid min-w-0 gap-6 lg:grid-cols-3">
          <MarketingSection title="Providers" className="lg:col-span-2">
            <ul className="grid gap-2.5 grid-cols-1 sm:grid-cols-3">
              {providers.map((provider) => (
                <li
                  key={provider.label}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5"
                >
                  <span className="min-w-0 text-sm font-medium">{provider.label}</span>
                  <DotBadge tone={provider.value === "connected" ? "green" : "amber"}>
                    {provider.value === "connected" ? "Connected" : "Not configured"}
                  </DotBadge>
                </li>
              ))}
            </ul>
          </MarketingSection>

          <MarketingSection title="Consent">
            <p className="text-sm text-muted-foreground">Only contacts with marketing consent.</p>
          </MarketingSection>
        </aside>
      </div>
    </PageContainer>
  );
}
