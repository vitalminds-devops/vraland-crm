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

export function dashboardSections(
  has: PermissionLookup,
  panelsInstalled = true,
): DashboardSections {
  const panel = (key: PermissionKey) => (panelsInstalled ? has(key) : true);

  const canViewDeals = has("deals.view");
  const canViewContacts = has("contacts.view");
  const canViewProperties = has("properties.view");
  const canViewTasks = has("tasks.view");
  const canViewCalendar = has("calendar.view");

  return {
    pipeline: panel("dashboard.view_pipeline") && canViewDeals,
    kpis: {
      leads: panel("dashboard.view_metrics") && canViewContacts,
      properties: panel("dashboard.view_metrics") && canViewProperties,
      pipeline: panel("dashboard.view_metrics") && canViewDeals,
      // Money received is billing data, not just deal data.
      collected: panel("dashboard.view_metrics") && canViewDeals && has("billing.view"),
    },
    revenue: panel("dashboard.view_revenue") && canViewDeals,
    summary: panel("dashboard.view_summary"),
    tasks: panel("dashboard.view_priorities") && canViewTasks,
    viewings: panel("dashboard.view_priorities") && canViewCalendar,
    closings: panel("dashboard.view_closings") && canViewDeals,
    taskLoad: panel("dashboard.view_task_load") && canViewTasks,
    inventory: panel("dashboard.view_inventory") && canViewProperties,
    activity:
      panel("dashboard.view_activity") &&
      (canViewContacts || canViewDeals || canViewProperties || canViewTasks || canViewCalendar),
  };
}
