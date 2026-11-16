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
    "contacts.approve",
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
    "properties.manage_unit_pictures",
    "properties.grant_unit_access",
    "properties.view_all_access",
  ],
  developments: [
    "developments.view",
    "developments.create",
    "developments.update",
    "developments.delete",
  ],
  deals: [
    "deals.view",
    "deals.create",
    "deals.update",
    "deals.delete",
    "deals.change_stage",
    "deals.reassign_agent",
    "deals.approve_stage_change",
    "deals.move_back",
  ],
  tasks: ["tasks.view", "tasks.create", "tasks.update", "tasks.delete"],
  calendar: ["calendar.view", "calendar.manage"],
  marketing: [
    "marketing.view",
    // Create and edit campaigns, sequences, steps and message templates.
    "marketing.manage",
    "marketing.send",
    "marketing.delete",
  ],
  documents: ["documents.view", "documents.manage", "documents.view_sensitive"],
  reports: ["reports.view"],
  billing: ["billing.view", "billing.manage"],
  settings: [
    "settings.view",
    "settings.manage",
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
    description: "See the dashboard for records in scope.",
  },
  "dashboard.view_pipeline": {
    label: "Show pipeline distribution",
    description: "Opportunities by stage. Needs opportunity access.",
  },
  "dashboard.view_metrics": {
    label: "Show key figures",
    description: "Headline cards. Each needs its record access.",
  },
  "dashboard.view_revenue": {
    label: "Show revenue & forecast",
    description: "Closed sales vs. forecast. Needs opportunity access.",
  },
  "dashboard.view_summary": {
    label: "Show at-a-glance readings",
    description: "Quick readings. Each needs its record access.",
  },
  "dashboard.view_priorities": {
    label: "Show tasks & viewings",
    description: "Due in the next 7 days. Needs task or calendar access.",
  },
  "dashboard.view_closings": {
    label: "Show upcoming closings",
    description: "Closings in the next 30 days. Needs opportunity access.",
  },
  "dashboard.view_task_load": {
    label: "Show task load",
    description: "Open tasks by due date. Needs task access.",
  },
  "dashboard.view_inventory": {
    label: "Show properties by status",
    description: "Properties by listing status. Needs property access.",
  },
  "dashboard.view_activity": {
    label: "Show recent activity",
    description: "Latest activity on records in scope.",
  },

  "contacts.view": {
    label: "View contacts",
    description: "See contacts in scope.",
  },
  "contacts.create": {
    label: "Create contacts",
    description: "Add a new contact.",
  },
  "contacts.update": {
    label: "Edit contacts",
    description: "Change a contact's details.",
  },
  "contacts.delete": {
    label: "Delete contacts",
    description: "Remove a contact from the CRM.",
  },
  "contacts.approve": {
    label: "Approve contacts",
    description: "Approve or reject pending contacts.",
  },
  "contacts.import": {
    label: "Import contacts",
    description: "Bulk-load contacts from a file.",
  },
  "contacts.export": {
    label: "Export contacts",
    description: "Download contact data.",
  },
  "contacts.reassign_broker": {
    label: "Reassign a contact's broker",
    description: "Move a contact and its records to another broker.",
  },

  "requirements.view": {
    label: "View client documents",
    description: "See the document checklist on visible contacts.",
  },
  "requirements.manage": {
    label: "Manage client documents",
    description: "Add, upload and remove client documents.",
  },

  "properties.view": {
    label: "View properties",
    description: "See properties in scope.",
  },
  "properties.create": {
    label: "Create properties",
    description: "Add a new property.",
  },
  "properties.update": {
    label: "Edit properties",
    description: "Change the details of a property.",
  },
  "properties.delete": {
    label: "Delete properties",
    description: "Remove a property from the CRM.",
  },
  "properties.manage_units": {
    label: "Manage units",
    description: "Generate, update status of, and remove units.",
  },
  "properties.manage_unit_pictures": {
    label: "Manage unit pictures",
    description: "Add, replace and remove unit photos.",
  },
  "properties.grant_unit_access": {
    label: "Grant property access",
    description: "Share properties or units, up to your own access.",
  },
  "properties.view_all_access": {
    label: "See everyone's property access",
    description: "Without it, see only access you can manage.",
  },

  "developments.view": {
    label: "View developments",
    description: "See developments with their properties and units.",
  },
  "developments.create": {
    label: "Create developments",
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
    label: "View opportunities",
    description: "See opportunities in scope.",
  },
  "deals.create": {
    label: "Create opportunities",
    description: "Open a new opportunity.",
  },
  "deals.update": {
    label: "Edit opportunities",
    description: "Change the details of an opportunity.",
  },
  "deals.delete": {
    label: "Delete opportunities",
    description: "Remove an opportunity from the CRM.",
  },
  "deals.change_stage": {
    label: "Move opportunities between stages",
    description: "Move opportunities along the pipeline, per stage rules.",
  },
  "deals.reassign_agent": {
    label: "Reassign an opportunity's agent",
    description: "Move an opportunity and its commission to another agent.",
  },
  "deals.approve_stage_change": {
    label: "Approve a gated stage change",
    description: "Approve moves into stages that need approval.",
  },
  "deals.move_back": {
    label: "Move opportunities back",
    description: "Move an opportunity to an earlier stage.",
  },

  "tasks.view": {
    label: "View tasks",
    description: "See tasks in scope.",
  },
  "tasks.create": {
    label: "Create tasks",
    description: "Add a task.",
  },
  "tasks.update": {
    label: "Edit tasks",
    description: "Change a task, or mark it done.",
  },
  "tasks.delete": {
    label: "Delete tasks",
    description: "Remove a task.",
  },

  "calendar.view": {
    label: "View calendar and viewings",
    description: "See the calendar and viewings in scope.",
  },
  "calendar.manage": {
    label: "Manage calendar and viewings",
    description: "Schedule, change and cancel viewings and events.",
  },

  "marketing.view": {
    label: "View marketing",
    description: "See campaigns, automations and templates in scope.",
  },
  "marketing.manage": {
    label: "Manage marketing",
    description: "Create and edit campaigns, automations and templates.",
  },
  "marketing.send": {
    label: "Send campaigns and run automations",
    description: "Send campaigns and run automation steps.",
  },
  "marketing.delete": {
    label: "Delete marketing records",
    description: "Remove campaigns, automations and templates. Sent ones are kept.",
  },

  "documents.view": {
    label: "View documents",
    description: "See documents on records in scope.",
  },
  "documents.manage": {
    label: "Manage documents",
    description: "Upload, replace and remove documents.",
  },
  "documents.view_sensitive": {
    label: "View sensitive documents",
    description: "See contracts, agreements and financial proofs.",
  },

  "reports.view": {
    label: "View reports",
    description: "See reports for records in scope.",
  },

  "billing.view": {
    label: "View billing",
    description: "See the bills of opportunities in their data access.",
  },
  "billing.manage": {
    label: "Record reservation fee payments",
    description: "Record and remove payments on those bills.",
  },

  "settings.view": {
    label: "View settings",
    description: "Open Settings (read-only).",
  },
  "settings.manage": {
    label: "Manage settings",
    description: "Change organization settings.",
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
    label: "Manage roles and permissions",
    description: "Change what each role can do and see.",
  },
  "settings.audit": {
    label: "View logs",
    description: "Read the audit log.",
  },

  "records.view_own": {
    label: "See own records",
    description: "Records they created or are assigned.",
  },
  "records.view_team": {
    label: "See team records",
    description: "Their records plus their agents'.",
  },
  "records.view_all": {
    label: "See all records",
    description: "Every record in the organization.",
  },
} satisfies Record<PermissionKey, { label: string; description: string }>;

const moduleLabels: Record<string, string> = {
  dashboard: "Dashboard",
  contacts: "Contacts",
  requirements: "Client documents",
  properties: "Properties",
  developments: "Developments",
  deals: "Opportunities",
  tasks: "Tasks",
  calendar: "Calendar & viewings",
  marketing: "Marketing",
  documents: "Documents",
  reports: "Reports",
  billing: "Billing",
  settings: "Settings & access",
  records: "Data access",
};

export function moduleLabel(module: string): string {
  return moduleLabels[module] ?? module;
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
    "deals.create",
    "deals.update",
    "deals.change_stage",
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "calendar.view",
    "calendar.manage",
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
  broker: "Agent access, plus leads a team of agents.",
  "master-broker": "All records and reports. No settings, users or roles.",
  agent: "Works their own contacts, opportunities and properties.",
  viewer: "Read-only access to the records they can see.",
  "license-broker": brokerAccessDescription,
  "network-partner-ih": brokerAccessDescription,
  "network-partner-ind": brokerAccessDescription,
  "sales-executive-ih": brokerAccessDescription,
  "sales-executive-ind": brokerAccessDescription,
  "sales-director-ih": brokerAccessDescription,
  "consultant-ih": brokerAccessDescription,
  "sales-executive": brokerAccessDescription,
};

const administratorMinusSettings = permissionKeys.filter(
  (key) =>
    !(permissionCatalog.settings as readonly string[]).includes(key) &&
    !key.startsWith("billing.") &&
    key !== "properties.view_all_access",
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
      key !== "contacts.approve" &&
      key !== "properties.grant_unit_access" &&
      key !== "deals.move_back",
  ),
  broker: brokerPermissions,
  "master-broker": administratorMinusSettings,
  agent: agentPermissions,
  viewer: permissionKeys.filter(
    (key) =>
      (key.endsWith(".view") || dashboardPanelKeys.includes(key) || key === "records.view_all") &&
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

const dataScopeRank: Record<DataScope, number> = {
  own: 0,
  broker_team: 1,
  organization: 2,
};

export function isDataScope(value: string | null | undefined): value is DataScope {
  return !!value && (dataScopes as readonly string[]).includes(value);
}

export const dataScopeRanking = dataScopeRank;

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
