import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import SalesPage from "../../../../app/(crm)/reports/sales/page";
import ForecastPage from "../../../../app/(crm)/reports/forecast/page";
import AgentsPage from "../../../../app/(crm)/reports/agents/page";
import { GET } from "../../../../app/api/reports/[report]/export/route";
import { reportMonth } from "../lib/report-metrics";

const fixture = vi.hoisted(() => ({ empty: false }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePagePermission: vi.fn(),
  getAuthorizationContext: async () => ({}),
}));
vi.mock("@/lib/permissions/policy", () => ({ hasPermission: () => true }));
vi.mock("@/features/reports/components/report-charts", () => {
  const chart = (kind: string) =>
    function ChartFixture(props: unknown) {
      return createElement("div", {
        "data-report-chart": kind,
        "data-props": JSON.stringify(props),
      });
    };
  return {
    SalesTrendChart: chart("sales"),
    ForecastChart: chart("pipeline"),
    ArimaForecastChart: chart("arima"),
  };
});
vi.mock("@/features/reports/queries/report.queries", () => ({
  getReportOptions: async () => ({
    agents: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Ana Santos" }],
    developments: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Fairfield Heights" }],
    propertyTypes: ["condominium"],
  }),
  getSalesReport: async () => ({
    currency: "PHP",
    summary: {
      closedDeals: fixture.empty ? 0 : 28,
      salesValue: 56000000,
      averageDealValue: 2000000,
      pipelineValue: 18500000,
      pipelineDeals: 12,
      expectedClosings: 4,
      expectedClosingValue: 8000000,
    },
    trend: fixture.empty
      ? []
      : [
          { month: "2026-10", deals: 2, value: 4000000 },
          { month: "2026-11", deals: 3, value: 6000000 },
        ],
    closedDeals: fixture.empty
      ? []
      : [
          {
            id: "deal",
            title: "Dela Cruz, John · Unit 2A · Fairfield Heights",
            amount: 2000000,
            actualCloseDate: "2026-11-17",
            agentName: "Ana Santos",
            propertyTitle: "Two-bedroom condominium",
          },
        ],
  }),
  getForecastReport: async () => ({
    currency: "PHP",
    summary: { deals: 12, gross: 18500000, weighted: 9250000 },
    monthly: fixture.empty
      ? []
      : [
          { month: "2026-11", gross: 8000000, weighted: 4800000 },
          { month: "2026-12", gross: 10500000, weighted: 4450000 },
        ],
    stages: fixture.empty
      ? []
      : [
          { stage: "Reservation", deals: 8, gross: 12000000, weighted: 7200000 },
          { stage: "Opportunity", deals: 4, gross: 6500000, weighted: 2050000 },
        ],
    arima: {
      model: fixture.empty ? null : "ARIMA(0,1,0) with drift",
      observations: fixture.empty ? 0 : 12,
      trainedThrough: "2026-10",
      history: [
        { month: "2026-08", value: 3000000 },
        { month: "2026-09", value: 4000000 },
        { month: "2026-10", value: 4500000 },
      ],
      forecast: fixture.empty
        ? []
        : [
            { month: "2026-11", value: 5000000, lower: 3500000, upper: 6500000 },
            { month: "2026-12", value: 5500000, lower: 3700000, upper: 7300000 },
          ],
    },
  }),
  getAgentReport: async () => ({
    currency: "PHP",
    agents: fixture.empty
      ? []
      : [
          {
            id: "agent",
            name: "Ana Santos",
            activeLeads: 15,
            closedDeals: 4,
            salesValue: 8000000,
            activities: 45,
            deals: 8,
            conversionRate: 20,
          },
          {
            id: "agent2",
            name: "Leo Reyes",
            activeLeads: 7,
            closedDeals: 2,
            salesValue: 4000000,
            activities: 21,
            deals: 5,
            conversionRate: 10,
          },
        ],
  }),
}));
beforeEach(() => {
  fixture.empty = false;
});
const search = {
  from: "2026-01-01",
  to: "2026-11-30",
  agent: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  development: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  propertyType: "condominium",
};
const pages = {
  sales: SalesPage,
  forecast: ForecastPage,
  agents: AgentsPage,
};
async function render(kind: keyof typeof pages) {
  return renderToStaticMarkup(await pages[kind]({ searchParams: Promise.resolve(search) }));
}

it.each(["sales", "forecast"] as const)(
  "shows all applicable filters and exports the chosen range on %s",
  async (kind) => {
    const html = await render(kind);
    expect(html).toContain('name="development"');
    expect(html).toContain('name="propertyType"');
    expect(html).toContain("Apply filters");
    expect(html).toContain("Reporting period:");
    expect(html).toContain("Dates use Manila time.");
    expect(html).toContain("development=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(html).toContain('aria-current="page"');
  },
);

it("avoids hidden property filters on the agent report and explains its ratio", async () => {
  const html = await render("agents");
  expect(html).not.toContain('name="development"');
  expect(html).not.toContain("development=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  expect(html).toContain("Won / leads");
  expect(html).toContain("Won opportunities may belong to older contacts.");
  expect(html).toContain("Ranked by sales value");
  expect(html).toContain("Agents included");
});

it("keeps the pipeline forecast ahead of the separately explained historical projection", async () => {
  const html = await render("forecast");
  expect(html.indexOf("Pipeline by expected close month")).toBeLessThan(
    html.indexOf("Historical sales projection"),
  );
  expect(html).toContain("separate from the selected pipeline period");
  expect(html).toContain("Oct 2026");
  expect(html).toContain("₱9,250,000.00");
  expect(html).not.toContain("Agent, source");
});

it("explains sales timing and the limited on-screen list", async () => {
  const html = await render("sales");
  expect(html).toContain("Sales values are not payments collected");
  expect(html).toContain("Showing 1 of 28 won opportunities");
  expect(html).toContain("up to 10,000 rows");
});

it("labels report months", () => {
  expect(reportMonth("2026-11")).toBe("Nov 2026");
});

it("uses the same agent ratio label in the CSV", async () => {
  const response = await GET(
    new Request("http://localhost/api/reports/agents/export?from=2026-01-01&to=2026-11-30"),
    { params: Promise.resolve({ report: "agents" }) },
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Won / leads (%)");
});

it("no longer exports the removed lead conversion report", async () => {
  const response = await GET(
    new Request("http://localhost/api/reports/conversion/export?from=2026-01-01&to=2026-11-30"),
    { params: Promise.resolve({ report: "conversion" }) },
  );
  expect(response.status).toBe(404);
});
