import { superAdministratorRoleSlug } from "@/lib/permissions/catalog";
import {
  hasOrganizationWideAccess,
  hasPermission,
  type AuthorizationContext,
} from "@/lib/permissions/policy";

/** Which contact buttons to show: each flag mirrors the check its server action makes. */
export function contactPageActions(context: AuthorizationContext) {
  return {
    canCreate: hasPermission(context, "contacts.create"),
    canEdit: hasPermission(context, "contacts.update"),
    canArchive: hasPermission(context, "contacts.delete"),
    canImport: hasPermission(context, "contacts.import"),
    canExport: hasPermission(context, "contacts.export"),
    canViewDocuments: hasPermission(context, "requirements.view"),
    // reassignContactBroker needs the permission and "See all records".
    canReassign:
      hasPermission(context, "contacts.reassign_broker") && hasOrganizationWideAccess(context),
    // Only a super administrator may override the lock on won sales.
    canOverrideWonLock: context.roles.includes(superAdministratorRoleSlug),
  };
}
