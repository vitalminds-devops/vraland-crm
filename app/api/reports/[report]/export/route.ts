import {
  getAgentReport,
  getConversionReport,
  getForecastReport,
  getSalesReport,
} from "@/features/reports/queries/report.queries";
import {
  parseReportFilters,
  type ReportFilters,
} from "@/features/reports/schemas/report-filter.schema";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { csvResponse, limitNote, type CsvCell } from "@/lib/http/csv";
import { hasPermission } from "@/lib/permissions/policy";

// shortcut: the sales export stops at 10,000 closed deals; page through it if a period ever holds more.
const EXPORT_LIMIT = 10_000;

/** Each report's rows, under the same filters as its page. */
const exporters: Record<string, (filters: ReportFilters) => Promise<CsvCell[][]>> = {
  async sales(filters) {
    const data = await getSalesReport(filters, EXPORT_LIMIT);
    return [
      ["Opportunity", "Agent", "Property", "Close date", `Amount (${data.currency})`],
      ...data.closedDeals.map((deal) => [
        deal.title,
        deal.agentName,
        deal.propertyTitle,
        deal.actualCloseDate,
        deal.amount,
      ]),
      ...limitNote(data.closedDeals.length, EXPORT_LIMIT),
    ];
  },
  async forecast(filters) {
    const data = await getForecastReport(filters);
    return [
      [
        "Month",
        "Opportunities",
        `Total pipeline value (${data.currency})`,
        `Weighted sales forecast (${data.currency})`,
      ],
      ...data.monthly.map((row) => [row.month, row.deals, row.gross, row.weighted]),
      [],
      [
        "Stage",
        "Opportunities",
        `Total pipeline value (${data.currency})`,
        `Weighted sales forecast (${data.currency})`,
      ],
      ...data.stages.map((row) => [row.stage, row.deals, row.gross, row.weighted]),
    ];
  },
  async agents(filters) {
    const data = await getAgentReport(filters);
    return [
      [
        "Agent",
        "Active leads",
        "Opportunities created",
        "Won",
        `Sales value (${data.currency})`,
        "Won / leads (%)",
        "Activities",
      ],
      ...data.agents.map((agent) => [
        agent.name,
        agent.activeLeads,
        agent.deals,
        agent.closedDeals,
        agent.salesValue,
        agent.conversionRate,
        agent.activities,
      ]),
    ];
  },
  async conversion(filters) {
    const data = await getConversionReport(filters);
    return [["Stage", "Contacts"], ...data.funnel.map((stage) => [stage.label, stage.value])];
  },
};

export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const context = await getAuthorizationContext();
  if (!context) return new Response("Authentication is required", { status: 401 });
  if (!hasPermission(context, "reports.view")) return new Response("Forbidden", { status: 403 });

  const { report } = await params;
  const exporter = Object.hasOwn(exporters, report) ? exporters[report] : undefined;
  if (!exporter) return new Response("Not found", { status: 404 });

  const search = Object.fromEntries(new URL(request.url).searchParams);
  // Forecast looks ahead by default, like its page.
  const filters = parseReportFilters(search, new Date(), report === "forecast" ? "ahead" : "past");
  return csvResponse(
    await exporter(filters),
    `vra-${report}-report-${filters.from}-to-${filters.to}.csv`,
  );
}
