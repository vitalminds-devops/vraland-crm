import { Activity, CheckCircle2, CircleDollarSign, Users } from "lucide-react";

import { StatCard } from "@/components/common/stat-card";
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
import { ReportShell } from "@/features/reports/components/report-shell";
import { getAgentReport, getReportOptions } from "@/features/reports/queries/report.queries";
import { parseReportFilters } from "@/features/reports/schemas/report-filter.schema";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function AgentReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("reports.view");
  const filters = parseReportFilters(await searchParams);
  const [data, options] = await Promise.all([getAgentReport(filters), getReportOptions()]);

  const money = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: data.currency,
      maximumFractionDigits: 0,
    }).format(value);

  const totals = data.agents.reduce(
    (acc, agent) => ({
      activeLeads: acc.activeLeads + agent.activeLeads,
      closedDeals: acc.closedDeals + agent.closedDeals,
      salesValue: acc.salesValue + agent.salesValue,
      activities: acc.activities + agent.activities,
    }),
    { activeLeads: 0, closedDeals: 0, salesValue: 0, activities: 0 },
  );

  return (
    <ReportShell
      title="Agent leaderboard"
      description="How each agent is doing."
      active="/reports/agents"
      filters={filters}
      options={options}
      showSource={false}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active agents"
          value={data.agents.length.toLocaleString()}
          detail={`${totals.activeLeads.toLocaleString()} active leads.`}
          icon={Users}
        />
        <StatCard
          label="Closed deals"
          value={totals.closedDeals.toLocaleString()}
          detail="Closed-won in period."
          icon={CheckCircle2}
        />
        <StatCard
          label="Sales value"
          value={money(totals.salesValue)}
          detail="From agents' deals."
          icon={CircleDollarSign}
        />
        <StatCard
          label="Activities"
          value={totals.activities.toLocaleString()}
          detail="Logged in period."
          icon={Activity}
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs dark:shadow-none">
        {data.agents.length ? (
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[760px] text-left text-sm">
              <TableHeader className={tableHeadClass}>
                <TableRow>
                  <TableHead scope="col" className="px-4 py-3 font-medium">
                    Agent
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                    Active leads
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                    Deals opened
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                    Won
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                    Sales value
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                    Conversion
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                    Activities
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/40">
                {data.agents.map((agent, index) => (
                  <TableRow key={agent.id} className="transition-colors hover:bg-muted/30">
                    <TableCell className="px-4 py-4 font-medium">
                      <span className="mr-3 inline-grid size-7 place-items-center rounded-full bg-muted text-xs tabular-nums">
                        {index + 1}
                      </span>
                      {agent.name}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right tabular-nums">
                      {agent.activeLeads.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right tabular-nums">
                      {agent.deals.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right tabular-nums">
                      {agent.closedDeals.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right font-medium tabular-nums">
                      {money(agent.salesValue)}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right tabular-nums">
                      {agent.conversionRate}%
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right tabular-nums">
                      {agent.activities.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No agents to compare"
            description="No sales activity in this period."
          />
        )}
      </section>
      <p className="mt-3 text-xs text-muted-foreground">
        Close rate = closed-won ÷ leads assigned. Super Administrator excluded.
      </p>
    </ReportShell>
  );
}
