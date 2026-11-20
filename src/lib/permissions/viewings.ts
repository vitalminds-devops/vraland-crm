import type { AuthorizationContext } from "./policy";
import { hasOrganizationWideAccess } from "./policy";

/**
 * Viewing record with minimal fields needed for permission checks.
 */
export type ViewingReference = {
  id: string;
  organizationId: string;
  agentUserId: string | null;
  eventCreatedBy: string | null;
  contactId: string;
  propertyId: string;
  dealId: string | null;
};

function isViewingOwner(
  context: AuthorizationContext,
  viewing: ViewingReference,
  dealParticipants?: string[],
): boolean {
  // User is the assigned agent
  if (viewing.agentUserId && viewing.agentUserId === context.userId) return true;

  // User created the calendar event
  if (viewing.eventCreatedBy && viewing.eventCreatedBy === context.userId) return true;

  // User is a participant on the related deal
  if (dealParticipants && dealParticipants.includes(context.userId)) {
    return true;
  }

  return false;
}

/** Whether this user may change (or, with `permission` Delete viewings, delete) the viewing. */
export function canEditViewing(
  context: AuthorizationContext,
  viewing: ViewingReference,
  dealParticipants?: string[],
  permission: "calendar.update_viewings" | "calendar.delete_viewings" = "calendar.update_viewings",
): boolean {
  if (!context.permissions.has(permission)) return false;

  if (!isSameOrganization(context, viewing.organizationId)) return false;

  // Organization-wide users can edit any viewing
  if (hasOrganizationWideAccess(context)) return true;

  // Non-organization-wide users can only edit their own viewings
  return isViewingOwner(context, viewing, dealParticipants);
}

/**
 * Check if the viewing belongs to the same organization as the user.
 */
function isSameOrganization(context: AuthorizationContext, viewingOrganizationId: string): boolean {
  return context.organizationId === viewingOrganizationId;
}
