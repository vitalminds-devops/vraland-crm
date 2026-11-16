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
      description="Closed sales over time."
      active="/reports/sales"
      filters={filters}
      options={options}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Closed deals"
          value={data.summary.closedDeals.toLocaleString()}
          detail={`${money(data.summary.salesValue)} total sales.`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Average deal value"
          value={money(data.summary.averageDealValue)}
          detail="Per closed-won deal."
          icon={CircleDollarSign}
        />
        <StatCard
          label="Open pipeline"
          value={money(data.summary.pipelineValue)}
          detail={`${data.summary.pipelineDeals.toLocaleString()} active deals.`}
          icon={Layers}
        />
        <StatCard
          label="Expected closings"
          value={data.summary.expectedClosings.toLocaleString()}
          detail={`${money(data.summary.expectedClosingValue)} in the next 30 days.`}
          icon={CalendarClock}
        />
      </div>

      <section className="mt-6 rounded-xl border border-border/50 bg-card p-5 shadow-xs dark:shadow-none">
        <h2 className="mb-5 font-semibold">Monthly closed sales</h2>
        <SalesTrendChart data={trend} currency={data.currency} />
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs dark:shadow-none">
        <div className="p-5">
          <h2 className="font-semibold">Closed deals</h2>
        </div>
        {data.closedDeals.length ? (
          <div className="overflow-x-auto">
            <Table className="w-full text-left text-sm">
              <TableHeader className={tableHeadClass}>
                <TableRow>
                  <TableHead scope="col" className="px-4 py-3 font-medium">
                    Deal
                  </TableHead>
                  <TableHead scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
                    Agent
                  </TableHead>
                  <TableHead scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                    Property
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 font-medium">
                    Closed
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
                      <Link href={`/deals/${deal.id}`} className="font-medium hover:text-primary">
                        {deal.title}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">
                      {deal.agentName}
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-xs text-muted-foreground lg:table-cell">
                      {deal.propertyTitle ?? "No property"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      {deal.actualCloseDate
                        ? new Intl.DateTimeFormat("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }).format(new Date(`${deal.actualCloseDate}T00:00:00`))
                        : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-medium tabular-nums">
                      {money(deal.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState icon={Handshake} title="No closed sales in this period" />
        )}
      </section>
    </ReportShell>
  );
}
