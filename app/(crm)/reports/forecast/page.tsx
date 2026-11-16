import { ArimaForecastChart, ForecastChart } from "@/features/reports/components/report-charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricCard, ReportEmpty, ReportShell } from "@/features/reports/components/report-shell";
import { getForecastReport, getReportOptions } from "@/features/reports/queries/report.queries";
import { parseReportFilters } from "@/features/reports/schemas/report-filter.schema";
import { requirePagePermission } from "@/lib/permissions/authorization";
export default async function ForecastReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("reports.view");
  const filters = parseReportFilters(await searchParams, new Date(), "ahead");
  const [data, options] = await Promise.all([getForecastReport(filters), getReportOptions()]);
  const money = currency(data.currency);
  return (
    <ReportShell
      title="Sales forecasting"
      description="ARIMA sales projections and expected pipeline revenue."
      active="/reports/forecast"
      filters={filters}
      options={options}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Forecast deals"
          value={String(data.summary.deals)}
          detail="Open deals expected in period"
        />
        <MetricCard
          label="Gross pipeline"
          value={money(data.summary.gross)}
          detail="Before probability weighting"
        />
        <MetricCard
          label="Weighted forecast"
          value={money(data.summary.weighted)}
          detail="Deal value × close probability"
        />
      </div>
      <section className="mt-6 rounded-xl border bg-card p-5" aria-label="ARIMA sales forecast">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">ARIMA Sales Forecast</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Based on {data.arima.observations} completed months of closed sales through{" "}
              {data.arima.trainedThrough}. Agent, source, development and property filters apply.
            </p>
          </div>
          {data.arima.model && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {data.arima.model}
            </span>
          )}
        </header>
        {data.arima.forecast.length ? (
          <>
            <p className="mb-4 text-sm">
              Projected sales over the next six months:{" "}
              <strong>
                {money(data.arima.forecast.reduce((sum, point) => sum + point.value, 0))}
              </strong>
            </p>
            <ArimaForecastChart
              history={data.arima.history}
              forecast={data.arima.forecast}
              currency={data.currency}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              The shaded band shows a 95% model prediction interval. Forecasts use up to 36
              completed months in {data.currency}; actual sales may fall outside this range.{" "}
              <a
                href="https://otexts.com/fpp3/arima.html"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                About ARIMA
              </a>
            </p>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Forecast</TableHead>
                    <TableHead className="text-right">Lower estimate</TableHead>
                    <TableHead className="text-right">Upper estimate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.arima.forecast.map((point) => (
                    <TableRow key={point.month}>
                      <TableCell>{point.month}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(point.value)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(point.lower)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(point.upper)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <ReportEmpty>
            At least six completed months of sales history, including recorded sales, are needed to
            fit an ARIMA forecast. Add actual close dates and amounts to won deals.
          </ReportEmpty>
        )}
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-5 font-semibold">Pipeline by Expected Close Month</h2>
          <ForecastChart data={data.monthly} currency={data.currency} />
        </section>
        <section className="overflow-hidden rounded-xl border bg-card">
          <h2 className="p-5 font-semibold">Forecast by stage</h2>
          {data.stages.length ? (
            <div className="overflow-x-auto">
              <Table className="w-full text-left text-sm">
                <TableHeader className="bg-muted/50 text-xs text-muted-foreground">
                  <TableRow>
                    <TableHead className="px-4 py-3">Stage</TableHead>
                    <TableHead>Deals</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead className="pr-4">Weighted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {data.stages.map((row) => (
                    <TableRow key={row.stage}>
                      <TableCell className="px-4 py-3 font-medium">{row.stage}</TableCell>
                      <TableCell>{row.deals}</TableCell>
                      <TableCell>{money(row.gross)}</TableCell>
                      <TableCell className="pr-4">{money(row.weighted)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <ReportEmpty>No open deals are expected in this period.</ReportEmpty>
          )}
        </section>
      </div>
    </ReportShell>
  );
}
const currency = (code: string) => (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: code,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
