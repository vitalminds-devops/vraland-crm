import { expect, it } from "vitest";
import type { PermissionKey } from "./catalog";
import {
  dashboardPanelNeeds,
  dashboardSections,
  panelUsable,
  withoutUnusablePanels,
} from "./view-access";

const holding =
  (...keys: PermissionKey[]) =>
  (key: PermissionKey) =>
    keys.includes(key);

it("shows a dashboard panel only with its panel key and the module it reads", () => {
  // The figures panel alone shows nothing it can't read.
  const figuresOnly = dashboardSections(holding("dashboard.view", "dashboard.view_metrics"));
  expect(figuresOnly.kpis).toEqual({
    leads: false,
    properties: false,
    pipeline: false,
    collected: false,
  });
  const sales = dashboardSections(
    holding("dashboard.view_metrics", "deals.view", "dashboard.view_revenue"),
  );
  expect(sales.kpis.pipeline).toBe(true);
  expect(sales.revenue).toBe(true);
  // Money received is billing data: deals alone don't show it.
  expect(sales.kpis.collected).toBe(false);
  expect(
    dashboardSections(holding("dashboard.view_metrics", "deals.view", "billing.view")).kpis
      .collected,
  ).toBe(true);
});

it("needs both the panel key and module access for each list panel", () => {
  const sections = dashboardSections(holding("dashboard.view_priorities", "tasks.view"));
  expect([sections.tasks, sections.viewings]).toEqual([true, false]);
  expect(dashboardSections(holding("tasks.view")).tasks).toBe(false);
});

it("hides every panel from someone with no panel keys", () => {
  expect(dashboardSections(holding("deals.view")).pipeline).toBe(false);
});

it("agrees with the dashboard: a panel the editor allows shows with just its module", () => {
  const sectionOf: Record<string, (s: ReturnType<typeof dashboardSections>) => boolean> = {
    "dashboard.view_pipeline": (s) => s.pipeline,
    "dashboard.view_revenue": (s) => s.revenue,
    "dashboard.view_closings": (s) => s.closings,
    "dashboard.view_metrics": (s) => Object.values(s.kpis).some(Boolean),
    "dashboard.view_priorities": (s) => s.tasks || s.viewings,
    "dashboard.view_task_load": (s) => s.taskLoad,
    "dashboard.view_inventory": (s) => s.inventory,
    "dashboard.view_activity": (s) => s.activity,
  };
  for (const [panel, needs] of Object.entries(dashboardPanelNeeds))
    for (const need of needs!) {
      const sections = dashboardSections(holding(panel as PermissionKey, need));
      expect([panel, need, sectionOf[panel]!(sections)]).toEqual([panel, need, true]);
      expect(panelUsable(panel, holding(need))).toBe(true);
    }
  expect(panelUsable("dashboard.view_revenue", holding("tasks.view"))).toBe(false);
});

it("drops dashboard panels when the module they need is unticked", () => {
  expect([
    ...withoutUnusablePanels(
      new Set(["dashboard.view_revenue", "dashboard.view_summary", "tasks.view"]),
    ),
  ]).toEqual(["dashboard.view_summary", "tasks.view"]);
});
