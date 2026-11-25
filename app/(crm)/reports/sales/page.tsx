import Link from "next/link";
import { CalendarClock, CheckCircle2, CircleDollarSign, Handshake, Layers } from "lucide-react";

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
import { SalesTrendChart } from "@/features/reports/components/report-charts";
import { ReportShell } from "@/features/reports/components/report-shell";
import { monthKeys } from "@/features/reports/lib/report-metrics";
import { getReportOptions, getSalesReport } from "@/features/reports/queries/report.queries";
import { parseReportFilters } from "@/features/reports/schemas/report-filter.schema";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("reports.view");
  const filters = parseReportFilters(await searchParams);
  const [data, options] = await Promise.all([getSalesReport(filters), getReportOptions()]);

  const money = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: data.currency,
      maximumFractionDigits: 0,
    }).format(value);
  const closeDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(
          new Date(`${value}T00:00:00Z`),
        )
      : "No close date";

  const trend = data.trend.length
    ? monthKeys(filters.from, filters.to).map(
        (month) =>
          data.trend.find((row) => row.month === month) ?? {
            month,
            deals: 0,
            value: 0,
          },
      )
    : [];

  return (
    <ReportShell
      title="Sales performance"
      description="Won opportunity values by close date."
      active="/reports/sales"
      filters={filters}
      options={options}
      extendedFilters
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Won opportunities"
          value={data.summary.closedDeals.toLocaleString()}
          detail={`${money(data.summary.salesValue)} total sales.`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Average sale value"
          value={money(data.summary.averageDealValue)}
          detail="Per opportunity won in this period."
          icon={CircleDollarSign}
        />
        <StatCard
          label="Current open pipeline"
          value={money(data.summary.pipelineValue)}
          detail={`${data.summary.pipelineDeals.toLocaleString()} open opportunities, across all close dates.`}
          icon={Layers}
        />
        <StatCard
          label="Upcoming closings"
          value={data.summary.expectedClosings.toLocaleString()}
          detail={`${money(data.summary.expectedClosingValue)} in the next 30 days.`}
          icon={CalendarClock}
        />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Sales values are not payments collected. The date range applies to won sales; open pipeline
        and upcoming closings reflect current opportunities.
      </p>

      <section className="mt-6 rounded-xl border border-border/50 bg-card p-5 shadow-xs dark:shadow-none">
        <h2 className="mb-5 font-semibold">Monthly won sales</h2>
        <SalesTrendChart data={trend} currency={data.currency} />
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs dark:shadow-none">
        <div className="p-5">
          <h2 className="font-semibold">Won opportunities</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Showing {data.closedDeals.length.toLocaleString()} of{" "}
            {data.summary.closedDeals.toLocaleString()} won opportunities, most recent first. Export
            CSV for up to 10,000 rows.
          </p>
        </div>
        {data.closedDeals.length ? (
          <div className="overflow-x-auto">
            <Table className="w-full text-left text-sm">
              <TableHeader className={tableHeadClass}>
                <TableRow>
                  <TableHead scope="col" className="px-4 py-3 font-medium">
                    Opportunity
                  </TableHead>
                  <TableHead scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
                    Agent
                  </TableHead>
                  <TableHead scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                    Property
                  </TableHead>
                  <TableHead scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
                    Close date
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/40">
                {data.closedDeals.map((deal) => (
                  <TableRow key={deal.id} className="transition-colors hover:bg-muted/30">
                    <TableCell className="px-4 py-3">
                      <Link
                        href={`/deals/${deal.id}`}
                        className="font-medium break-words hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                      >
                        {deal.title}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                        Agent: {deal.agentName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground lg:hidden">
                        {deal.propertyTitle ?? "No property"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                        Closed: {closeDate(deal.actualCloseDate)}
                      </p>
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">
                      {deal.agentName}
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-xs text-muted-foreground lg:table-cell">
                      {deal.propertyTitle ?? "No property"}
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-xs whitespace-nowrap text-muted-foreground sm:table-cell">
                      {closeDate(deal.actualCloseDate)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums">
                      {money(deal.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState icon={Handshake} title="No won sales in this period" />
        )}
      </section>
    </ReportShell>
  );
}
