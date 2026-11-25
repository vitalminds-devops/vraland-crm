import { expect, it } from "vitest";
import type { PermissionKey } from "./catalog";
import { dashboardSections } from "./view-access";

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
