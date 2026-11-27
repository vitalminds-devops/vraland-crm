import "server-only";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { contacts, deals, users } from "@/db/schema";
import type { AuthorizationContext } from "./policy";
import { resolveDataScope } from "./policy";

function organizationScope(column: AnyPgColumn, context: AuthorizationContext): SQL {
  return eq(column, context.organizationId);
}

export type ScopedColumns = {
  organizationId: AnyPgColumn;
  ownerUserId?: AnyPgColumn;
  brokerUserId?: AnyPgColumn;
};

export function dataScopeCondition(context: AuthorizationContext, columns: ScopedColumns): SQL {
  const organization = organizationScope(columns.organizationId, context);
  const scope = resolveDataScope(context);
  if (scope === "organization") return organization;

  const ownerMatch = columns.ownerUserId ? eq(columns.ownerUserId, context.userId) : undefined;
  const brokerMatch = columns.brokerUserId ? eq(columns.brokerUserId, context.userId) : undefined;

  if (scope === "own") return and(organization, ownerMatch)!;

  const teamMatch = columns.ownerUserId
    ? inArray(
        columns.ownerUserId,
        // Archived members stay in: their records remain the lead's until handed over.
        sql`(select ${users.id} from ${users}
          where ${users.organizationId} = ${context.organizationId}
            and (${users.id} = ${context.userId} or ${users.brokerId} = ${context.userId}))`,
      )
    : undefined;

  return and(organization, or(ownerMatch, teamMatch, brokerMatch))!;
}

export function scopedAgentCondition(context: AuthorizationContext): SQL {
  return dataScopeCondition(context, {
    organizationId: users.organizationId,
    ownerUserId: users.id,
    brokerUserId: users.brokerId,
  });
}

/** Contacts the user may see: their own, their team's, or as the contact's broker. */
export function contactScopeCondition(context: AuthorizationContext): SQL {
  return dataScopeCondition(context, {
    organizationId: contacts.organizationId,
    ownerUserId: contacts.agentUserId,
    brokerUserId: contacts.brokerUserId,
  });
}

/** Opportunities the user may see: as the agent, their team lead, or the broker. */
export function dealScopeCondition(context: AuthorizationContext): SQL {
  return dataScopeCondition(context, {
    organizationId: deals.organizationId,
    ownerUserId: deals.agentUserId,
    brokerUserId: deals.brokerUserId,
  });
}
