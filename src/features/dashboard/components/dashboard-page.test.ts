import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DashboardPage from "../../../../app/(crm)/dashboard/page";

const fixture = vi.hoisted(() => ({
  enabled: true,
  data: {
    currency: "PHP",
    organizationWide: true,
    scope: "organization",
    kpis: {
      activeLeads: 124,
      leadChange: 25,
      activeProperties: 18,
      pipelineDeals: 32,
      pipelineValue: 85000000,
      collected: 1250000,
      payments: 14,
    },
    readings: [{ key: "won", label: "Won this month", value: "₱4.2M", hint: "3 won · 1 lost" }],
    priorities: [
      {
        id: "task",
        source: "task",
        title: "Follow up with the buyer about the two-bedroom unit at Fairfield Heights",
        type: "follow_up",
        priority: "high",
        dueAt: new Date("2026-11-18T18:00:00Z"),
        status: "pending",
      },
    ],
    closingSoon: [
      {
        id: "opportunity",
        title: "Dela Cruz, John · Two-bedroom unit at Fairfield Heights",
        amount: 2300000,
        expectedCloseDate: "2026-11-25",
        probability: 80,
        stageName: "Reservation",
        agentName: "Alex Santos",
      },
    ],
    taskLoad: { overdue: 3, dueToday: 5, thisWeek: 8, unscheduled: 2, completedThisWeek: 12 },
    inventoryStatus: [
      { status: "active", value: 18 },
      { status: "reserved", value: 7 },
      { status: "sold", value: 12 },
    ],
    activities: [],
    revenueSeries: [
      { month: "Oct 26", closedSales: 4200000, forecast: 0 },
      { month: "Nov 26", closedSales: 3100000, forecast: 2700000 },
      { month: "Dec 26", closedSales: 0, forecast: 5400000 },
    ],
    pipelineStages: [
      { name: "Opportunity", value: 12 },
      { name: "Reservation", value: 8 },
      { name: "Won", value: 5 },
    ],
  },
}));

vi.mock("@/lib/permissions/authorization", () => ({ requirePagePermission: vi.fn() }));
vi.mock("@/features/dashboard/queries/dashboard.queries", () => ({
  getDashboardData: async () => ({
    ...fixture.data,
    readings: fixture.enabled ? fixture.data.readings : [],
    sections: {
      kpis: {
        leads: fixture.enabled,
        properties: fixture.enabled,
        pipeline: fixture.enabled,
        collected: fixture.enabled,
      },
      revenue: fixture.enabled,
      pipeline: fixture.enabled,
      tasks: fixture.enabled,
      viewings: fixture.enabled,
      closings: fixture.enabled,
      taskLoad: fixture.enabled,
      inventory: fixture.enabled,
      activity: fixture.enabled,
    },
  }),
}));
vi.mock("@/features/dashboard/components/dashboard-charts", () => ({
  RevenueChart: (props: unknown) =>
    createElement("div", { id: "revenue-preview", "data-chart": JSON.stringify(props) }),
  PipelineStageChart: (props: unknown) =>
    createElement("div", { id: "pipeline-preview", "data-chart": JSON.stringify(props) }),
}));

beforeEach(() => {
  fixture.enabled = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T04:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function render() {
  return renderToStaticMarkup(await DashboardPage());
}

it("puts upcoming work before charts and distinguishes sales values from payments", async () => {
  const html = await render();
  expect(html.indexOf("Upcoming tasks &amp; viewings")).toBeLessThan(
    html.indexOf("Closed sales &amp; forecast"),
  );
  expect(html).toContain("Open opportunities");
  expect(html).toContain("These are sales values, not payments received.");
  expect(html).not.toContain("+25%");
  expect(html).toContain('href="/deals/opportunity"');
  expect(html).toContain('role="region"');
  expect(html).toContain("No activity yet.");
});

it("keeps long task and closing names readable", async () => {
  const html = await render();
  expect(html).toContain(fixture.data.priorities[0].title);
  expect(html).toContain(fixture.data.closingSoon[0].title);
  expect(html).not.toMatch(/class="[^"]*truncate[^"]*"[^>]*>Follow up/);
  expect(html).not.toMatch(/class="[^"]*truncate[^"]*"[^>]*>Dela Cruz/);
});

it("keeps panels hidden when dashboard permissions are absent", async () => {
  fixture.enabled = false;
  const html = await render();
  expect(html).toContain("No dashboard panels for your role");
  expect(html).not.toContain("Upcoming tasks");
  expect(html).not.toContain("Closed sales &amp; forecast");
});
