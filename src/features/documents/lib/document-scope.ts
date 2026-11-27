import "server-only";
import { and, eq, inArray, isNull, not, or, sql } from "drizzle-orm";
import { dealAgents, deals, documents, properties } from "@/db/schema";
import type { AuthorizationContext } from "@/lib/permissions/policy";
import { grantedPropertyCondition } from "@/lib/permissions/property-access";
import {
  dataScopeCondition,
  contactScopeCondition,
  dealScopeCondition,
} from "@/lib/permissions/scope";
import { sharedFileCategory } from "./shared-files";

export function documentScope(context: AuthorizationContext) {
  const linkedToContact = and(not(isNull(documents.contactId)), contactScopeCondition(context))!;

  const linkedToDeal = and(not(isNull(documents.dealId)), dealScopeCondition(context))!;

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

  const shared = and(
    eq(documents.organizationId, context.organizationId),
    eq(documents.category, sharedFileCategory),
    eq(documents.isSensitive, false),
    isNull(documents.contactId),
    isNull(documents.dealId),
    isNull(documents.propertyId),
    isNull(documents.userId),
  );
  return or(shared, linkedToContact, linkedToDeal, linkedToProperty, unlinked)!;
}

// The permission alone decides, for every role, so unticking it on a role or user takes effect.
export function sensitiveDocumentCondition(context: AuthorizationContext) {
  if (context.permissions.has("documents.view_sensitive")) return sql`true`;

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
