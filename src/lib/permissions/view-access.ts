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
