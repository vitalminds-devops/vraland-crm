export const permissionCatalog = {
  dashboard: [
    "dashboard.view",
    "dashboard.view_pipeline",
    "dashboard.view_metrics",
    "dashboard.view_revenue",
    "dashboard.view_summary",
    "dashboard.view_priorities",
    "dashboard.view_closings",
    "dashboard.view_task_load",
    "dashboard.view_inventory",
    "dashboard.view_activity",
  ],
  contacts: [
    "contacts.view",
    "contacts.create",
    "contacts.update",
    "contacts.delete",
    "contacts.import",
    "contacts.export",
    "contacts.reassign_broker",
  ],
  requirements: ["requirements.view", "requirements.manage"],
  properties: [
    "properties.view",
    "properties.create",
    "properties.update",
    "properties.delete",
    "properties.manage_units",
    "properties.manage_prices",
    "properties.manage_unit_pictures",
    "properties.grant_unit_access",
    "properties.view_all_access",
    "properties.access_all",
  ],
  developments: [
    "developments.view",
    "developments.create",
    "developments.update",
    "developments.delete",
  ],
  deals: [
    "deals.view",
    "deals.export",
    "deals.create",
    "deals.update",
    "deals.delete",
    "deals.change_stage",
    "deals.reassign_agent",
    "deals.approve_stage_change",
    "deals.move_back",
  ],
  tasks: ["tasks.view", "tasks.create", "tasks.update", "tasks.delete"],
  calendar: [
    "calendar.view",
    "calendar.manage",
    "calendar.assign",
    "calendar.broadcast",
    "calendar.edit_others",
    "calendar.schedule_viewings",
    "calendar.assign_viewings",
    "calendar.update_viewings",
    "calendar.delete_viewings",
  ],
  marketing: [
    "marketing.view",
    // Create and edit campaigns, sequences, steps and message templates.
    "marketing.manage",
    "marketing.send",
    "marketing.delete",
  ],
  documents: [
    "documents.view",
    "documents.manage",
    "documents.archive",
    "documents.view_sensitive",
    "documents.manage_shared",
  ],
  reports: ["reports.view"],
  billing: ["billing.view", "billing.manage"],
  settings: [
    "settings.view",
    "settings.system",
    "users.manage",
    "users.delete",
    "users.restore",
    "roles.manage",
    "settings.audit",
  ],
  // Whose records the other permissions reach; the broadest one held applies.
  records: ["records.view_own", "records.view_team", "records.view_all"],
} as const;

export const permissionKeys = Object.values(permissionCatalog).flat();
export type PermissionKey = (typeof permissionKeys)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (permissionKeys as readonly string[]).includes(value);
}

export const dashboardPanelKeys: PermissionKey[] = permissionCatalog.dashboard.filter(
  (key) => key !== "dashboard.view",
);

export const permissionMetadata = {
  "dashboard.view": {
    label: "View dashboard",
    description: "Open Dashboard for records you can access.",
  },
  "dashboard.view_pipeline": {
    label: "Show opportunities by stage",
    description: "Show Opportunities by stage on Dashboard. Requires Sales pipeline access.",
  },
  "dashboard.view_metrics": {
    label: "Show dashboard figures",
    description:
      "Show won sales, payments and reservations received, available units and parking, floors and active contacts. Sales figures need View sales pipeline; payments need View billing.",
  },
  "dashboard.view_revenue": {
    label: "Show won sales & forecast",
    description: "Show Won sales & forecast on Dashboard. Requires Sales pipeline access.",
  },
  "dashboard.view_summary": {
    label: "Show summary",
    description: "Show Summary on Dashboard for records you can access.",
  },
  "dashboard.view_priorities": {
    label: "Show upcoming tasks & viewings",
    description: "Due in the next 7 days. Needs task or calendar access.",
  },
  "dashboard.view_closings": {
    label: "Show closing in the next 30 days",
    description: "Show Closing in the next 30 days on Dashboard. Requires Sales pipeline access.",
  },
  "dashboard.view_task_load": {
    label: "Show open tasks by due date",
    description: "Open tasks by due date. Needs task access.",
  },
  "dashboard.view_inventory": {
    label: "Show properties by status",
    description: "Properties by status. Needs View properties.",
  },
  "dashboard.view_activity": {
    label: "Show recent activity",
    description: "Show Recent activity for records you can access.",
  },

  "contacts.view": {
    label: "View contacts & leads",
    description: "Open Contacts & leads and view contacts you can access.",
  },
  "contacts.create": {
    label: "Add contacts",
    description: "Add a new contact.",
  },
  "contacts.update": {
    label: "Edit contacts",
    description: "Change a contact's details.",
  },
  "contacts.delete": {
    label: "Archive contacts",
    description: "Archive contacts and restore them from Archived.",
  },
  "contacts.import": {
    label: "Import contacts",
    description: "Use Import to add contacts from a CSV file.",
  },
  "contacts.export": {
    label: "Export contacts",
    description: "Download contact data.",
  },
  "contacts.reassign_broker": {
    label: "Reassign a contact's broker",
    description:
      "Move a contact and its records to another broker, and change a contact's agent. Needs See all records.",
  },

  "requirements.view": {
    label: "View contact documents",
    description: "See the document checklist on visible contacts.",
  },
  "requirements.manage": {
    label: "Manage contact documents",
    description: "Add, upload and remove contact documents.",
  },

  "properties.view": {
    label: "View properties",
    description:
      "View properties, floors, units and parking slots you have access to, and export them to CSV.",
  },
  "properties.create": {
    label: "Add properties",
    description: "Add a new property.",
  },
  "properties.update": {
    label: "Edit properties",
    description: "Change the details of a property.",
  },
  "properties.delete": {
    label: "Archive properties",
    description: "Archive properties and restore them from Archived properties.",
  },
  "properties.manage_units": {
    label: "Design properties",
    description:
      "Open the Design page: unit and parking types, floors and floor plans, sections, unit identifiers, units and parking slots.",
  },
  "properties.manage_prices": {
    label: "Manage prices",
    description:
      "Set prices, reservation fees and monthly amortization on unit and parking types, units and parking slots.",
  },
  "properties.manage_unit_pictures": {
    label: "Manage unit photos",
    description: "Add, replace and remove unit photos.",
  },
  "properties.grant_unit_access": {
    label: "Give property access",
    description: "Give access to properties, floors, units and parking slots you have access to.",
  },
  "properties.access_all": {
    label: "Access all properties",
    description: "See and change every property without being given property access.",
  },
  "properties.view_all_access": {
    label: "See everyone's property access",
    description: "Without it, see only access you can manage.",
  },

  "developments.view": {
    label: "View developments",
    description: "Open Developments and view properties, floors and units you have access to.",
  },
  "developments.create": {
    label: "Add developments",
    description: "Add a new development.",
  },
  "developments.update": {
    label: "Edit developments",
    description: "Change the details of a development.",
  },
  "developments.delete": {
    label: "Delete developments",
    description: "Remove an empty development.",
  },

  "deals.view": {
    label: "View sales pipeline",
    description: "Open Sales pipeline and view opportunities you can access.",
  },
  "deals.create": {
    label: "Add opportunities",
    description: "Open a new opportunity.",
  },
  "deals.export": {
    label: "Export opportunities",
    description: "Download opportunities, with their amounts, as a CSV file.",
  },
  "deals.update": {
    label: "Edit opportunities",
    description: "Change the details of an opportunity, and its units with Move between stages.",
  },
  "deals.delete": {
    label: "Delete opportunities",
    description: "Remove an opportunity from the CRM.",
  },
  "deals.change_stage": {
    label: "Move opportunities between stages",
    description: "Move opportunities between stages in Sales pipeline.",
  },
  "deals.reassign_agent": {
    label: "Reassign an opportunity's agent",
    description: "Move an opportunity and its commission to another agent.",
  },
  "deals.approve_stage_change": {
    label: "Approve stage changes",
    description: "Approve or reject stage change requests in Approvals.",
  },
  "deals.move_back": {
    label: "Move opportunities back",
    description: "Move an opportunity to an earlier stage.",
  },

  "tasks.view": {
    label: "View tasks",
    description:
      "Open Tasks and My tasks, see each task's Assignee and Created by, and export tasks to CSV.",
  },
  "tasks.create": {
    label: "Add tasks",
    description: "Add a task.",
  },
  "tasks.update": {
    label: "Edit tasks",
    description: "Edit task details or change Status to Completed.",
  },
  "tasks.delete": {
    label: "Delete tasks",
    description: "Remove a task.",
  },

  "calendar.view": {
    label: "View calendar & viewings",
    description: "Open Calendar & viewings and view events you can access.",
  },
  "calendar.manage": {
    label: "Add events",
    description: "Add events, and change or delete the ones you created.",
  },
  "calendar.assign": {
    label: "Invite others to events",
    description: "Invite chosen people to an event. They accept or decline it.",
  },
  "calendar.broadcast": {
    label: "Invite everyone to events",
    description: "Invite every active user to an event at once.",
  },
  "calendar.edit_others": {
    label: "Edit and delete others' events",
    description: "Change or delete events someone else created.",
  },
  "calendar.schedule_viewings": {
    label: "Schedule viewings",
    description: "Schedule property viewings for a contact.",
  },
  "calendar.assign_viewings": {
    label: "Schedule viewings for other agents",
    description: "Pick another agent for a viewing, not just yourself.",
  },
  "calendar.update_viewings": {
    label: "Reschedule viewings and record outcomes",
    description:
      "Edit and move viewings, and mark them confirmed, completed, no-show or cancelled.",
  },
  "calendar.delete_viewings": {
    label: "Delete viewings",
    description: "Remove a viewing that has no outcome on record.",
  },

  "marketing.view": {
    label: "View marketing",
    description: "View campaigns, follow-ups and templates in Marketing.",
  },
  "marketing.manage": {
    label: "Manage marketing",
    description: "Create and manage campaigns, follow-ups and templates.",
  },
  "marketing.send": {
    label: "Send campaigns and run follow-ups",
    description: "Send campaigns and run follow-up steps.",
  },
  "marketing.delete": {
    label: "Delete marketing records",
    description: "Delete campaigns, follow-ups and templates. Sent campaigns are kept.",
  },

  "documents.view": {
    label: "View documents",
    description: "Open Documents to download, print or save shared files as PDF.",
  },
  "documents.manage": {
    label: "Manage documents",
    description: 'Upload documents. Shared files need "Manage shared files".',
  },
  "documents.archive": {
    label: "Archive documents",
    description: "Open Archive, archive documents and restore archived documents.",
  },
  "documents.manage_shared": {
    label: "Manage shared files",
    description: "Add and remove the files everyone in the organization can open.",
  },
  "documents.view_sensitive": {
    label: "View sensitive documents",
    description: "See contracts, agreements and financial proofs.",
  },

  "reports.view": {
    label: "View reports & analytics",
    description: "Open Reports & analytics for records you can access.",
  },

  "billing.view": {
    label: "View billing",
    description:
      "Open Billing and Payments to view bills, payments and balances, print bills and export them.",
  },
  "billing.manage": {
    label: "Manage bills and payments",
    description:
      "Save bill, Edit bill, Record payment and Remove payment in Billing and Payments. Needs View billing.",
  },

  "settings.view": {
    label: "View settings",
    description: "Open Settings (read-only).",
  },
  "settings.system": {
    label: "View system performance",
    description: "See server CPU, memory, disk and uptime.",
  },
  "users.manage": {
    label: "Manage users",
    description: "Create users and change their roles and access.",
  },
  "users.delete": {
    label: "Archive users",
    description: "Archive users. Their records are kept.",
  },
  "users.restore": {
    label: "Restore archived users",
    description: "Restore archived users.",
  },
  "roles.manage": {
    label: "Manage roles & permissions",
    description: "Change what each role can do and see.",
  },
  "settings.audit": {
    label: "View logs",
    description: "Open Logs to view recorded changes.",
  },

  "records.view_own": {
    label: "See own records",
    description: "Always on: everyone sees the records they own or are assigned.",
  },
  "records.view_team": {
    label: "See team records",
    description: "Your records and your agents' records.",
  },
  "records.view_all": {
    label: "See all records",
    description: "All records in your organization.",
  },
} satisfies Record<PermissionKey, { label: string; description: string }>;

const moduleLabels: Record<string, string> = {
  dashboard: "Dashboard",
  contacts: "Contacts & leads",
  requirements: "Contact documents",
  properties: "Properties",
  developments: "Developments",
  deals: "Sales pipeline",
  tasks: "Tasks",
  calendar: "Calendar & viewings",
  marketing: "Marketing",
  documents: "Documents",
  reports: "Reports & analytics",
  billing: "Billing",
  settings: "Settings",
  records: "Data access",
};

export function moduleLabel(module: string): string {
  return moduleLabels[module] ?? module;
}

/**
 * The catalog group a permission is listed under: users.manage and roles.manage are Settings, not
 * groups of their own. A key outside the catalog falls back to its prefix.
 */
export function permissionModule(key: string): string {
  const group = Object.entries(permissionCatalog).find(([, keys]) =>
    (keys as readonly string[]).includes(key),
  );
  return group?.[0] ?? key.split(".")[0]!;
}

const agentPermissions = permissionKeys.filter((key) =>
  [
    "dashboard.view",
    "dashboard.view_pipeline",
    "dashboard.view_metrics",
    "dashboard.view_revenue",
    "dashboard.view_summary",
    "dashboard.view_priorities",
    "dashboard.view_closings",
    "dashboard.view_task_load",
    "dashboard.view_inventory",
    "dashboard.view_activity",
    "contacts.view",
    "contacts.create",
    "contacts.update",
    "properties.view",
    "developments.view",
    "deals.view",
    "deals.export",
    "deals.create",
    "deals.update",
    "deals.change_stage",
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "calendar.view",
    "calendar.manage",
    "calendar.schedule_viewings",
    "calendar.update_viewings",
    "calendar.delete_viewings",
    "requirements.view",
    "requirements.manage",
    "documents.view",
    "records.view_own",
  ].includes(key),
);

const brokerPermissions = [
  ...agentPermissions,
  "properties.grant_unit_access",
  "records.view_team",
  "billing.view",
  "calendar.assign",
] as const satisfies readonly PermissionKey[];

const brokerAccessDescription = "Same access as a Broker.";

export const roleLabels: Record<RoleSlug, string> = {
  "super-administrator": "Super Administrator",
  administrator: "Administrator",
  "sales-manager": "Sales Manager",
  broker: "Broker",
  "master-broker": "Master Broker",
  agent: "Agent",
  viewer: "Viewer",
  "license-broker": "License Broker",
  "network-partner-ih": "Network Partner IH",
  "network-partner-ind": "Network Partner IND",
  "sales-executive-ih": "Sales Executive IH",
  "sales-executive-ind": "Sales Executive IND",
  "sales-director-ih": "Sales Director IH",
  "consultant-ih": "Consultant IH",
  "sales-executive": "Sales Executive",
};

export const roleDescriptions: Record<RoleSlug, string> = {
  "super-administrator": "Full access. Managed outside the app.",
  administrator: "Full access to everything.",
  "sales-manager": "Manages all opportunities, agents and reports.",
  broker: "Manages team contacts, opportunities and tasks, and gives property access.",
  "master-broker":
    "All organization records and Reports & analytics, with properties they can access. No Settings, Users or Roles & permissions.",
  agent:
    "Works on own records in Contacts & leads, Sales pipeline and Tasks; views Properties and Documents they can access.",
  viewer:
    "Views every module it can open, including Reports, Marketing and the Settings overview. Cannot make changes.",
  "license-broker": brokerAccessDescription,
  "network-partner-ih": brokerAccessDescription,
  "network-partner-ind": brokerAccessDescription,
  "sales-executive-ih": brokerAccessDescription,
  "sales-executive-ind": brokerAccessDescription,
  "sales-director-ih": brokerAccessDescription,
  "consultant-ih": brokerAccessDescription,
  "sales-executive": brokerAccessDescription,
};

/** Kept to Administrators by default: skipping property access, and the organization's shared files. */
const administratorOnlyKeys: readonly PermissionKey[] = [
  "properties.access_all",
  "documents.manage_shared",
];

const administratorMinusSettings = permissionKeys.filter(
  (key) =>
    !(permissionCatalog.settings as readonly string[]).includes(key) &&
    key !== "documents.archive" &&
    !key.startsWith("billing.") &&
    key !== "properties.view_all_access" &&
    !administratorOnlyKeys.includes(key),
);

export const rolePermissionDefaults = {
  "super-administrator": permissionKeys,
  administrator: permissionKeys,
  "sales-manager": permissionKeys.filter(
    (key) =>
      !key.startsWith("marketing.") &&
      !key.startsWith("billing.") &&
      !key.startsWith("settings.") &&
      !key.startsWith("users.") &&
      key !== "roles.manage" &&
      key !== "documents.archive" &&
      key !== "properties.grant_unit_access" &&
      key !== "deals.move_back" &&
      !administratorOnlyKeys.includes(key),
  ),
  broker: brokerPermissions,
  "master-broker": administratorMinusSettings,
  agent: agentPermissions,
  viewer: permissionKeys.filter(
    (key) =>
      (key.endsWith(".view") ||
        dashboardPanelKeys.includes(key) ||
        key === "records.view_all" ||
        key === "deals.export") &&
      key !== "documents.view_sensitive" &&
      !key.startsWith("billing."),
  ),
  "license-broker": brokerPermissions,
  "network-partner-ih": brokerPermissions,
  "network-partner-ind": brokerPermissions,
  "sales-executive-ih": brokerPermissions,
  "sales-executive-ind": brokerPermissions,
  "sales-director-ih": brokerPermissions,
  "consultant-ih": brokerPermissions,
  "sales-executive": brokerPermissions,
} satisfies Record<string, readonly PermissionKey[]>;

export type RoleSlug = keyof typeof rolePermissionDefaults;

export const superAdministratorRoleSlug = "super-administrator";
export const administratorRoleSlug = "administrator";
const brokerRoleSlug = "broker";
export const masterBrokerRoleSlug = "master-broker";
export const agentRoleSlug = "agent";

/** Roles that see the whole organization and may manage users. */
export const administratorRoleSlugs = [superAdministratorRoleSlug, administratorRoleSlug] as const;

/**
 * Roles that work exactly like Broker: same permissions, team lead for agents, broker documents.
 * shortcut: the newer roles borrow Broker's access, give each its own entry when their access differs.
 */
export const brokerAccessRoleSlugs = [
  brokerRoleSlug,
  "license-broker",
  "network-partner-ih",
  "network-partner-ind",
  "sales-executive-ih",
  "sales-executive-ind",
  "sales-director-ih",
  "consultant-ih",
  "sales-executive",
] as const;

export const brokerRoleSlugs = [...brokerAccessRoleSlugs, masterBrokerRoleSlug] as const;

/** Roles that represent an agent working their own book of business. */
const agentRoleSlugs = [agentRoleSlug, ...brokerAccessRoleSlugs, masterBrokerRoleSlug] as const;

export const brokerIdTargetRoleSlugs = [...brokerAccessRoleSlugs, "agent-broker"] as const;

export function isAdministratorRoleSlug(slug: string): boolean {
  return (administratorRoleSlugs as readonly string[]).includes(slug);
}

export function isBrokerRoleSlug(slug: string): boolean {
  return (brokerRoleSlugs as readonly string[]).includes(slug);
}

/** True for Broker and the roles that share its access (not Master Broker). */
export function isBrokerAccessRoleSlug(slug: string): boolean {
  return (brokerAccessRoleSlugs as readonly string[]).includes(slug);
}

/** True for either agent-side role. */
export function isAgentRoleSlug(slug: string): boolean {
  return (agentRoleSlugs as readonly string[]).includes(slug);
}

export function roleLabel(slug: string, fallbackName: string): string {
  return roleLabels[slug as RoleSlug] ?? fallbackName;
}

export function roleDescription(slug: string, fallbackDescription: string | null): string {
  return roleDescriptions[slug as RoleSlug] ?? fallbackDescription ?? "Custom role.";
}

export const dataScopes = ["own", "broker_team", "organization"] as const;
export type DataScope = (typeof dataScopes)[number];

export const dataScopeLabels: Record<DataScope, string> = {
  own: "Only records I own",
  broker_team: "Records I own plus my agents' records",
  organization: "All records in the organization",
};

export const roleDataScopeDefaults = {
  "super-administrator": "organization",
  administrator: "organization",
  "sales-manager": "organization",
  // Broker-type roles lead a team, so they see their agents' records by default.
  broker: "broker_team",
  "master-broker": "organization",
  agent: "own",
  viewer: "organization",
  "license-broker": "broker_team",
  "network-partner-ih": "broker_team",
  "network-partner-ind": "broker_team",
  "sales-executive-ih": "broker_team",
  "sales-executive-ind": "broker_team",
  "sales-director-ih": "broker_team",
  "consultant-ih": "broker_team",
  "sales-executive": "broker_team",
} satisfies Record<RoleSlug, DataScope>;

/** The permission that gives each data scope. */
export const dataScopePermissions = {
  own: "records.view_own",
  broker_team: "records.view_team",
  organization: "records.view_all",
} as const satisfies Record<DataScope, PermissionKey>;
