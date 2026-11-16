import {
  dataScopePermissions,
  isBrokerAccessRoleSlug,
  superAdministratorRoleSlug,
  type DataScope,
  type PermissionKey,
  type RoleSlug,
} from "./catalog";

export type AuthorizationContext = {
  authUserId: string;
  userId: string;
  organizationId: string;
  roles: readonly string[];
  permissions: ReadonlySet<string>;
};

const organizationWideRoles: readonly RoleSlug[] = ["super-administrator", "administrator"];

/** Whose records the user reaches: the broadest `records.*` permission they hold, else their own. */
export function resolveDataScope(context: Pick<AuthorizationContext, "permissions">): DataScope {
  if (context.permissions.has(dataScopePermissions.organization)) return "organization";
  if (context.permissions.has(dataScopePermissions.broker_team)) return "broker_team";
  return "own";
}

export function canManageUsers(context: AuthorizationContext): boolean {
  return context.permissions.has("users.manage");
}

/**
 * Whether the caller holds every one of these permissions, so they may hand them to someone
 * else: by granting them, assigning a role that has them, or changing a user who has them.
 * The Super Administrator is managed outside the app and may hand out anything.
 */
export function canGrantPermissions(
  context: Pick<AuthorizationContext, "roles" | "permissions">,
  keys: Iterable<string>,
): boolean {
  if (context.roles.includes(superAdministratorRoleSlug)) return true;
  for (const key of keys) if (!context.permissions.has(key)) return false;
  return true;
}

/** Bills of the opportunities in the user's data scope. */
export function canViewBilling(context: AuthorizationContext): boolean {
  return context.permissions.has("billing.view");
}

/** Roles that people report to as their Broker; they get a "My team" page listing those people. */
export function leadsATeam(context: AuthorizationContext): boolean {
  return context.roles.some((role) => isBrokerAccessRoleSlug(role) || role === "master-broker");
}

/** The "My team" page: leading a team, with data access wider than the user's own records. */
export function canViewTeam(context: AuthorizationContext): boolean {
  return leadsATeam(context) && resolveDataScope(context) !== "own";
}

/** Recording payments, on the bills of the opportunities in the user's data scope. */
export function canManageBilling(context: AuthorizationContext): boolean {
  return context.permissions.has("billing.view") && context.permissions.has("billing.manage");
}

export function canViewAuditLog(context: AuthorizationContext): boolean {
  return context.permissions.has("settings.audit");
}

/** Property inventory follows its own access grants; administrators skip them. */
export function hasUnrestrictedInventoryAccess(context: AuthorizationContext): boolean {
  return organizationWideRoles.some((role) => context.roles.includes(role));
}

export function canGrantUnitAccess(context: AuthorizationContext): boolean {
  return (
    hasUnrestrictedInventoryAccess(context) ||
    hasPermission(context, "properties.grant_unit_access")
  );
}

export function hasPermission(context: AuthorizationContext, permission: PermissionKey): boolean {
  return context.permissions.has(permission);
}

/** "See all records", from a role or the user's own permissions. */
export function hasOrganizationWideAccess(context: AuthorizationContext): boolean {
  return resolveDataScope(context) === "organization";
}
