import type { ComponentType, ReactNode } from "react";
import { Building2, CircleDollarSign, Handshake, LayoutDashboard, UsersRound } from "lucide-react";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { ActivityList } from "@/features/dashboard/components/activity-list";
import { ClosingSoon } from "@/features/dashboard/components/closing-soon";
import { InventoryStatus } from "@/features/dashboard/components/inventory-status";
import { TaskLoad } from "@/features/dashboard/components/task-load";
import { PipelineStageChart, RevenueChart } from "@/features/dashboard/components/dashboard-charts";
import { PriorityList } from "@/features/dashboard/components/priority-list";
import { ReadingList } from "@/features/dashboard/components/reading-list";
import { StatCard } from "@/components/common/stat-card";
import { getDashboardData } from "@/features/dashboard/queries/dashboard.queries";
import { compactCurrency } from "@/features/dashboard/lib/format";
import { requirePagePermission } from "@/lib/permissions/authorization";
import type { DataScope } from "@/lib/permissions/catalog";
import { cn } from "@/lib/utils/cn";

const cardClass =
  "min-w-0 rounded-xl border border-border/40 bg-card p-4 sm:p-5 shadow-xs dark:shadow-none";

const kpiColumns: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

/** A list panel, built as data so its position in the row can decide its span. */
type ListPanel = {
  key: string;
  title: string;
  description?: string;
  /** Set on lists that can run long; leaves short panels unconstrained. */
  scrollLabel?: string;
  body: ReactNode;
};

type KpiCard = {
  key: string;
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  trend?: number | null;
  href?: string;
};

function scopePhrase(organizationWide: boolean, scope: DataScope) {
  if (organizationWide) return "across the organization";
  switch (scope) {
    case "broker_team":
      return "across your team";
    case "own":
      return "assigned to you";
    default:
      return "within your access";
  }
}

export default async function DashboardPage() {
  await requirePagePermission("dashboard.view");
  const data = await getDashboardData();
  const { sections } = data;
  const where = scopePhrase(data.organizationWide, data.scope);

  const kpiCandidates: (KpiCard | false)[] = [
    sections.kpis.leads && {
      key: "leads",
      label: "Active contacts",
      value: data.kpis.activeLeads.toLocaleString(),
      detail: "Not yet converted",
      icon: UsersRound,
      trend: data.kpis.leadChange,
      href: "/contacts",
    },
    sections.kpis.properties && {
      key: "properties",
      label: "Active properties",
      value: data.kpis.activeProperties.toLocaleString(),
      detail: "Listed and active",
      icon: Building2,
      href: "/properties",
    },
    sections.kpis.pipeline && {
      key: "pipeline",
      label: "Open in pipeline",
      value: data.kpis.pipelineDeals.toLocaleString(),
      detail: `${compactCurrency(data.kpis.pipelineValue, data.currency)} total value`,
      icon: Handshake,
      href: "/pipeline",
    },
    sections.kpis.collected && {
      key: "collected",
      label: "Collected this month",
      value: compactCurrency(data.kpis.collected, data.currency),
      detail: `${data.kpis.payments.toLocaleString()} ${data.kpis.payments === 1 ? "payment" : "payments"} received`,
      icon: CircleDollarSign,
      href: "/billing",
    },
  ];
  const kpiCards = kpiCandidates.filter((card): card is KpiCard => Boolean(card));

  const showPriorities = sections.tasks || sections.viewings;
  const priorityTitle =
    sections.tasks && sections.viewings
      ? "Tasks & viewings to action"
      : sections.viewings
        ? "Viewings to action"
        : "Tasks to action";

  // Each entry is `false` when its permission is missing, which the filter drops.
  const listCandidates: (ListPanel | false)[] = [
    data.readings.length > 0 && {
      key: "readings",
      title: "Summary",
      description: "This month and the next 7 days.",
      body: <ReadingList items={data.readings} />,
    },
    showPriorities && {
      key: "priorities",
      title: priorityTitle,
      description: "Overdue first.",
      scrollLabel: priorityTitle,
      body: <PriorityList items={data.priorities} />,
    },
    sections.closings && {
      key: "closings",
      title: "Closing in the next 30 days",
      scrollLabel: "Upcoming closings",
      body: <ClosingSoon items={data.closingSoon} currency={data.currency} />,
    },
    sections.taskLoad && {
      key: "taskLoad",
      title: "Task load",
      description: "Open tasks by due date.",
      body: <TaskLoad data={data.taskLoad} />,
    },
    sections.inventory && {
      key: "inventory",
      title: "Properties by status",
      description: "By property status.",
      body: <InventoryStatus items={data.inventoryStatus} />,
    },
    sections.activity && {
      key: "activity",
      title: "Recent activity",
      scrollLabel: "Recent activity",
      body: <ActivityList items={data.activities} />,
    },
  ];
  const listPanels = listCandidates.filter((panel): panel is ListPanel => Boolean(panel));

  const distributionCount = Number(sections.pipeline);
  const panelCount =
    Number(sections.revenue) + distributionCount + kpiCards.length + listPanels.length;

  return (
    <PageContainer>
      <PageHeader title="Dashboard" description={where.charAt(0).toUpperCase() + where.slice(1)} />

      {panelCount === 0 ? (
        <div className={cn(cardClass, "mt-6 px-6 py-12 text-center")}>
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
            <LayoutDashboard aria-hidden="true" className="size-5" />
          </div>
          <h2 className="mt-4 text-[15px] font-semibold">No dashboard panels for your role</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Ask an administrator for access.
          </p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {kpiCards.length > 0 && (
            <div
              className={cn(
                "grid gap-4",
                kpiColumns[kpiCards.length] ?? "sm:grid-cols-2 lg:grid-cols-4",
              )}
            >
              {kpiCards.map((card) => (
                <StatCard
                  key={card.key}
                  label={card.label}
                  value={card.value}
                  detail={card.detail}
                  icon={card.icon}
                  trend={card.trend}
                  href={card.href}
                />
              ))}
            </div>
          )}

          {sections.revenue && (
            <Section
              title="Revenue & sales forecast"
              description="Closed sales and weighted pipeline."
            >
              <RevenueChart data={data.revenueSeries} currency={data.currency} />
            </Section>
          )}

          {distributionCount > 0 && (
            <div className={cn("grid gap-4 sm:gap-5", distributionCount === 2 && "xl:grid-cols-2")}>
              {sections.pipeline && (
                <Section title="Pipeline stage distribution" description="Includes won and lost.">
                  <PipelineStageChart data={data.pipelineStages} />
                </Section>
              )}
            </div>
          )}

          {listPanels.length > 0 && (
            <div className={cn("grid gap-4 sm:gap-5", listPanels.length > 1 && "xl:grid-cols-2")}>
              {listPanels.map((panel, index) => (
                <Section
                  key={panel.key}
                  title={panel.title}
                  description={panel.description}
                  scrollLabel={panel.scrollLabel}
                  className={cn(
                    listPanels.length > 1 &&
                      listPanels.length % 2 === 1 &&
                      index === listPanels.length - 1 &&
                      "xl:col-span-2",
                  )}
                >
                  {panel.body}
                </Section>
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}

function Section({
  title,
  description,
  scrollLabel,
  className,
  children,
}: {
  title: string;
  description?: string;
  scrollLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(cardClass, className)}>
      <div className="pb-1">
        <h2 className="text-[15px] leading-snug font-semibold">{title}</h2>
        {description && (
          <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {scrollLabel ? (
        <div className="mt-4 max-h-96 overflow-auto pr-1" tabIndex={0} aria-label={scrollLabel}>
          {children}
        </div>
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </section>
  );
}
