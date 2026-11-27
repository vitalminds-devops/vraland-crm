import type { ReactNode } from "react";
import { LayoutDashboard } from "lucide-react";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { ActivityList } from "@/features/dashboard/components/activity-list";
import { ClosingSoon } from "@/features/dashboard/components/closing-soon";
import { AvailabilityMeter, FactLine } from "@/features/dashboard/components/availability";
import { FigureStrip, type Figure } from "@/features/dashboard/components/figure-strip";
import { InventoryStatus } from "@/features/dashboard/components/inventory-status";
import { TaskLoad } from "@/features/dashboard/components/task-load";
import { PipelineStageChart, RevenueChart } from "@/features/dashboard/components/dashboard-charts";
import { PriorityList } from "@/features/dashboard/components/priority-list";
import { ReadingList } from "@/features/dashboard/components/reading-list";
import { getDashboardData } from "@/features/dashboard/queries/dashboard.queries";
import { formatMoneyShort } from "@/lib/utils/money";
import { requirePagePermission } from "@/lib/permissions/authorization";
import type { DataScope } from "@/lib/permissions/catalog";
import { cn } from "@/lib/utils/cn";

const cardClass = "min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5";

/** A list panel, built as data so its position in the row can decide its span. */
type ListPanel = {
  key: string;
  title: string;
  description?: string;
  /** Set on lists that can run long; leaves short panels unconstrained. */
  scrollLabel?: string;
  body: ReactNode;
};

function scopePhrase(organizationWide: boolean, scope: DataScope) {
  if (organizationWide) return "across the organization";
  switch (scope) {
    case "broker_team":
      return "across your team";
    case "own":
      return "your records";
    default:
      return "within your access";
  }
}

export default async function DashboardPage() {
  await requirePagePermission("dashboard.view");
  const data = await getDashboardData();
  const { sections } = data;
  const where = scopePhrase(data.organizationWide, data.scope);

  const count = (n: number, one: string, many: string) =>
    `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const money = (amount: number) => formatMoneyShort(amount, data.currency) ?? "";
  // The headline money: what was won, then what came in.
  const figureCandidates: (Figure | false)[] = [
    sections.kpis.pipeline && {
      key: "won",
      label: "Won sales value",
      value: money(data.kpis.wonValue),
      // Money collected is billing data: only with the payment figures.
      detail: sections.kpis.collected
        ? `${data.kpis.wonCount.toLocaleString()} won · ${money(data.kpis.wonCollected)} collected`
        : `${data.kpis.wonCount.toLocaleString()} won`,
      href: "/pipeline",
    },
    sections.kpis.collected && {
      key: "collected",
      label: "Payments received this month",
      value: money(data.kpis.collected),
      detail: count(data.kpis.payments, "payment", "payments"),
      href: "/payments",
    },
    sections.kpis.collected && {
      key: "reservationsReceived",
      label: "Reservations received this month",
      value: money(data.kpis.reservationsReceived),
      detail: count(data.kpis.reservationPayments, "payment", "payments"),
      href: "/payments",
    },
    sections.kpis.collected && {
      key: "monthlyPaid",
      label: "Monthly payments received",
      value: money(data.kpis.monthlyPaid),
      detail: `${count(data.kpis.monthlyPayments, "payment", "payments")} · All time`,
      href: "/payments",
    },
    // Summary shows it when on; without Summary the figures permission still promises it.
    sections.kpis.leads &&
      !sections.summary && {
        key: "activeContacts",
        label: "Active contacts",
        value: data.kpis.activeLeads.toLocaleString(),
        detail: "Not yet converted",
        href: "/contacts",
      },
  ];
  const figures = figureCandidates.filter((figure): figure is Figure => Boolean(figure));
  const showInventory = sections.kpis.properties || sections.inventory;

  const showPriorities = sections.tasks || sections.viewings;
  const priorityTitle =
    sections.tasks && sections.viewings
      ? "Upcoming tasks & viewings"
      : sections.viewings
        ? "Upcoming viewings"
        : "Upcoming tasks";

  // Each entry is `false` when its permission is missing, which the filter drops.
  const listCandidates: (ListPanel | false)[] = [
    showPriorities && {
      key: "priorities",
      title: priorityTitle,
      description: "Overdue items first, then the next 7 days.",
      scrollLabel: priorityTitle,
      body: <PriorityList items={data.priorities} />,
    },
    data.readings.length > 0 && {
      key: "readings",
      title: "Summary",
      description: "Results and upcoming work.",
      body: <ReadingList items={data.readings} />,
    },
    showInventory && {
      key: "inventory",
      title: "Properties",
      body: (
        <div className="space-y-4">
          {sections.kpis.properties && (
            <>
              <div className="grid gap-4 @min-[34rem]:grid-cols-2">
                <AvailabilityMeter
                  label="Available units"
                  available={data.kpis.availableUnits}
                  total={data.kpis.totalUnits}
                  unit="unit"
                />
                <AvailabilityMeter
                  label="Available parking"
                  available={data.kpis.availableParking}
                  total={data.kpis.totalParking}
                  unit="slot"
                />
              </div>
              <FactLine>
                {count(data.kpis.activeProperties, "active property", "active properties")} ·{" "}
                {count(data.kpis.floors, "floor", "floors")} across{" "}
                {count(data.kpis.floorProperties, "property", "properties")}
              </FactLine>
            </>
          )}
          {sections.inventory && (
            <div className="border-t border-border/60 pt-4">
              <h3 className="mb-3 text-[13px] font-medium">Properties by status</h3>
              <InventoryStatus items={data.inventoryStatus} />
            </div>
          )}
        </div>
      ),
    },
    sections.closings && {
      key: "closings",
      title: "Closing in the next 30 days",
      scrollLabel: "Upcoming closings",
      body: <ClosingSoon items={data.closingSoon} currency={data.currency} />,
    },
    sections.taskLoad && {
      key: "taskLoad",
      title: "Open tasks by due date",
      body: <TaskLoad data={data.taskLoad} />,
    },
    sections.activity && {
      key: "activity",
      title: "Recent activity",
      scrollLabel: "Recent activity",
      body: <ActivityList items={data.activities} />,
    },
  ];
  const listPanels = listCandidates.filter((panel): panel is ListPanel => Boolean(panel));

  const panelCount =
    Number(sections.revenue) + Number(sections.pipeline) + figures.length + listPanels.length;

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
            Ask an Administrator for access.
          </p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <FigureStrip figures={figures} />

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

          {(sections.revenue || sections.pipeline) && (
            <div
              className={cn(
                "grid gap-4 sm:gap-5",
                sections.revenue && sections.pipeline && "xl:grid-cols-[3fr_2fr]",
              )}
            >
              {sections.revenue && (
                <Section
                  title="Won sales & forecast"
                  description="Won opportunity values and open opportunities weighted by their probability of closing. These are sales values, not payments received."
                >
                  <RevenueChart data={data.revenueSeries} currency={data.currency} />
                </Section>
              )}
              {sections.pipeline && (
                <Section
                  title="Opportunities by stage"
                  description="Includes open, won and lost opportunities."
                >
                  <PipelineStageChart data={data.pipelineStages} />
                </Section>
              )}
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
    <section className={cn("@container", cardClass, className)}>
      <div className="pb-1">
        <h2 className="text-[15px] leading-snug font-semibold">{title}</h2>
        {description && (
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {scrollLabel ? (
        <div
          className="mt-4 max-h-96 overflow-auto pr-1 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          role="region"
          tabIndex={0}
          aria-label={scrollLabel}
        >
          {children}
        </div>
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </section>
  );
}
