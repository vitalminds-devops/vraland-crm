import { CheckCircle2, Gauge, Users } from "lucide-react";

import { StatCard } from "@/components/common/stat-card";
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
      description="Stage progress for contacts created in the selected period."
      active="/reports/conversion"
      filters={filters}
      options={options}
      extendedFilters
    >
      <div className="grid gap-4 sm:grid-cols-3">
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
          detail="Share of contacts with a won opportunity."
          icon={Gauge}
        />
      </div>
      <section className="mt-6">
        <h2 className="font-semibold">Lead progression</h2>
        <p className="mt-1 mb-4 text-sm leading-relaxed text-muted-foreground">
          Counts follow contacts created in the selected period. Their progress can include activity
          after that period.
        </p>
        <ConversionFunnel data={data.funnel} />
      </section>
    </ReportShell>
  );
}
