import type { PermissionKey } from "@/lib/permissions/catalog";
export type NavigationItem = {
  label: string;
  href: string;
  icon:
    | "dashboard"
    | "contacts"
    | "pipeline"
    | "properties"
    | "developments"
    | "tasks"
    | "calendar"
    | "marketing"
    | "documents"
    | "reports"
    | "billing"
    | "payments"
    | "team"
    | "settings";
  /** Shown when the user holds this permission, or any one of a list. */
  permission: PermissionKey | readonly PermissionKey[];
  match?: readonly string[];
  section?: string;
};
export const crmNavigation: readonly NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "dashboard",
    permission: "dashboard.view",
    section: "Overview",
  },
  {
    label: "Contacts & leads",
    href: "/contacts",
    icon: "contacts",
    permission: "contacts.view",
    section: "Sales",
  },
  {
    label: "Sales pipeline",
    href: "/pipeline",
    icon: "pipeline",
    permission: "deals.view",
    match: ["/deals"],
    section: "Sales",
  },
  {
    label: "My team",
    href: "/my-team",
    icon: "team",
    // Shown by `canViewTeam` (team leads with team or wider data access), not this key alone.
    permission: "contacts.view",
    section: "Sales",
  },
  {
    label: "Developments",
    href: "/developments",
    icon: "developments",
    permission: "developments.view",
    section: "Real estate",
  },
  {
    label: "Properties",
    href: "/properties",
    icon: "properties",
    permission: "properties.view",
    section: "Real estate",
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: "tasks",
    permission: "tasks.view",
    section: "Operations",
  },
  {
    label: "Calendar & viewings",
    href: "/calendar",
    icon: "calendar",
    permission: "calendar.view",
    section: "Operations",
  },
  {
    label: "Marketing",
    href: "/marketing",
    icon: "marketing",
    permission: "marketing.view",
    section: "Management",
  },
  {
    label: "Documents",
    href: "/documents",
    icon: "documents",
    permission: "documents.view",
    section: "Management",
  },
  {
    label: "Reports & analytics",
    href: "/reports",
    icon: "reports",
    permission: "reports.view",
    section: "Management",
  },
  {
    label: "Billing",
    href: "/billing",
    icon: "billing",
    // Shown by `canViewBilling`: View billing, for the opportunities in the user's data access.
    permission: "billing.view",
    section: "Management",
  },
  {
    label: "Payments",
    href: "/payments",
    icon: "payments",
    // Shown by `canManageBilling`: View billing and Record payments.
    permission: "billing.manage",
    section: "Management",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: "settings",
    permission: "settings.view",
    section: "System",
  },
];
