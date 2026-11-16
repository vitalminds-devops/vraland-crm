import "server-only";
import { and, eq, inArray, isNull, not, or, sql } from "drizzle-orm";
import { contacts, dealAgents, deals, documents, properties } from "@/db/schema";
import type { AuthorizationContext } from "@/lib/permissions/policy";
import { grantedPropertyCondition } from "@/lib/permissions/property-access";
import { dataScopeCondition } from "@/lib/permissions/scope";

export function documentScope(context: AuthorizationContext) {
  const linkedToContact = and(
    not(isNull(documents.contactId)),
    dataScopeCondition(context, {
      organizationId: contacts.organizationId,
      ownerUserId: contacts.assignedUserId,
      brokerUserId: contacts.brokerUserId,
    }),
  )!;

  const linkedToDeal = and(
    not(isNull(documents.dealId)),
    dataScopeCondition(context, {
      organizationId: deals.organizationId,
      ownerUserId: deals.primaryAgentUserId,
      brokerUserId: deals.brokerUserId,
    }),
  )!;

  // Property documents follow the property-access grants, like the property itself.
  const linkedToProperty = and(
    not(isNull(documents.propertyId)),
    dataScopeCondition(context, {
      organizationId: properties.organizationId,
    }),
    grantedPropertyCondition(context, { propertyId: properties.id }),
  )!;

  const unlinked = and(
    isNull(documents.contactId),
    isNull(documents.dealId),
    isNull(documents.propertyId),
    dataScopeCondition(context, {
      organizationId: documents.organizationId,
      ownerUserId: documents.createdBy,
    }),
  )!;

  return or(linkedToContact, linkedToDeal, linkedToProperty, unlinked)!;
}

const sensitiveReaderRoles = ["sales-manager", "administrator", "super-administrator"] as const;

function canViewSensitiveDocuments(context: AuthorizationContext): boolean {
  if (context.permissions.has("documents.view_sensitive")) return true;
  return sensitiveReaderRoles.some((role) => context.roles.includes(role));
}

export function sensitiveDocumentCondition(context: AuthorizationContext) {
  if (canViewSensitiveDocuments(context)) return sql`true`;

  // A deal participant: listed in `deal_agents`, or named on the deal itself.
  const participantDeal = and(
    eq(documents.isSensitive, true),
    not(isNull(documents.dealId)),
    or(
      inArray(
        documents.dealId,
        sql`(select ${dealAgents.dealId} from ${dealAgents}
          where ${dealAgents.userId} = ${context.userId})`,
      ),
      eq(deals.primaryAgentUserId, context.userId),
      eq(deals.brokerUserId, context.userId),
      eq(deals.createdBy, context.userId),
    ),
  )!;

  return or(eq(documents.isSensitive, false), participantDeal)!;
}
