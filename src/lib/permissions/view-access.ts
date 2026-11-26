import type { PermissionKey } from "./catalog";

/** A membership test over permission keys, however the caller holds them. */
export type PermissionLookup = (key: PermissionKey) => boolean;

/** The dashboard's panels, as booleans. The page renders from this. */
export type DashboardSections = {
  pipeline: boolean;
  kpis: {
    leads: boolean;
    properties: boolean;
    pipeline: boolean;
    collected: boolean;
  };
  revenue: boolean;
  summary: boolean;
  tasks: boolean;
  viewings: boolean;
  closings: boolean;
  taskLoad: boolean;
  inventory: boolean;
  activity: boolean;
};

export function dashboardSections(has: PermissionLookup): DashboardSections {
  const canViewDeals = has("deals.view");
  const canViewContacts = has("contacts.view");
  const canViewProperties = has("properties.view");
  const canViewTasks = has("tasks.view");
  const canViewCalendar = has("calendar.view");

  return {
    pipeline: has("dashboard.view_pipeline") && canViewDeals,
    kpis: {
      leads: has("dashboard.view_metrics") && canViewContacts,
      properties: has("dashboard.view_metrics") && canViewProperties,
      pipeline: has("dashboard.view_metrics") && canViewDeals,
      // Money received is billing data, not just deal data.
      collected: has("dashboard.view_metrics") && canViewDeals && has("billing.view"),
    },
    revenue: has("dashboard.view_revenue") && canViewDeals,
    summary: has("dashboard.view_summary"),
    tasks: has("dashboard.view_priorities") && canViewTasks,
    viewings: has("dashboard.view_priorities") && canViewCalendar,
    closings: has("dashboard.view_closings") && canViewDeals,
    taskLoad: has("dashboard.view_task_load") && canViewTasks,
    inventory: has("dashboard.view_inventory") && canViewProperties,
    activity:
      has("dashboard.view_activity") &&
      (canViewContacts || canViewDeals || canViewProperties || canViewTasks || canViewCalendar),
  };
}

/**
 * The module permissions each dashboard panel needs: it can show with any one of them. The role
 * editor greys out a panel without them, so a ticked panel always shows something.
 */
export const dashboardPanelNeeds: Partial<Record<PermissionKey, readonly PermissionKey[]>> = {
  "dashboard.view_pipeline": ["deals.view"],
  "dashboard.view_revenue": ["deals.view"],
  "dashboard.view_closings": ["deals.view"],
  "dashboard.view_metrics": ["contacts.view", "properties.view", "deals.view"],
  "dashboard.view_priorities": ["tasks.view", "calendar.view"],
  "dashboard.view_task_load": ["tasks.view"],
  "dashboard.view_inventory": ["properties.view"],
  "dashboard.view_activity": [
    "contacts.view",
    "deals.view",
    "properties.view",
    "tasks.view",
    "calendar.view",
  ],
};

/** Whether a dashboard panel can show anything with these permissions. */
export function panelUsable(key: string, has: (key: PermissionKey) => boolean): boolean {
  const needs = dashboardPanelNeeds[key as PermissionKey];
  return !needs || needs.some(has);
}

/** The keys without dashboard panels that no longer have a module to show. */
export function withoutUnusablePanels(keys: ReadonlySet<string>): Set<string> {
  const has = (key: PermissionKey) => keys.has(key);
  return new Set([...keys].filter((key) => panelUsable(key, has)));
}
