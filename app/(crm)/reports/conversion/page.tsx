import { CheckCircle2, Gauge, Users } from "lucide-react";

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
import { ConversionFunnel } from "@/features/reports/components/conversion-funnel";
import { ReportShell } from "@/features/reports/components/report-shell";
import { getConversionReport, getReportOptions } from "@/features/reports/queries/report.queries";
import { parseReportFilters } from "@/features/reports/schemas/report-filter.schema";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function ConversionReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("reports.view");
  const filters = parseReportFilters(await searchParams);
  const [data, options] = await Promise.all([getConversionReport(filters), getReportOptions()]);

  const leads = data.funnel.find((step) => step.key === "leads")?.value ?? 0;
  const closed = data.funnel.find((step) => step.key === "closed")?.value ?? 0;

  return (
    <ReportShell
      title="Lead conversion"
      description="How leads turn into sales."
      active="/reports/conversion"
      filters={filters}
      options={options}
      extendedFilters
    >
      <ConversionFunnel data={data.funnel} />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Leads created"
          value={leads.toLocaleString()}
          detail="Created in period."
          icon={Users}
        />
        <StatCard
          label={data.wonLabel}
          value={closed.toLocaleString()}
          detail="Reached the won stage."
          icon={CheckCircle2}
        />
        <StatCard
          label="Overall conversion"
          value={`${data.overallRate}%`}
          detail={`Leads to ${data.wonLabel}.`}
          icon={Gauge}
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs dark:shadow-none">
        <div className="p-5">
          <h2 className="font-semibold">Conversion by lead source</h2>
        </div>
        {data.sources.length ? (
          <div className="overflow-x-auto">
            <Table className="w-full text-left text-sm">
              <TableHeader className={tableHeadClass}>
                <TableRow>
                  <TableHead scope="col" className="px-4 py-3 font-medium">
                    Source
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                    Leads
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                    Won
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right font-medium">
                    Conversion
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/40">
                {data.sources.map((row) => (
                  <TableRow key={row.name} className="transition-colors hover:bg-muted/30">
                    <TableCell className="px-4 py-3 font-medium">{row.name}</TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums">
                      {row.leads.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums">
                      {row.closed.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums">{row.rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState icon={Users} title="No leads match" />
        )}
      </section>
    </ReportShell>
  );
}
