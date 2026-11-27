import "server-only";

import { and, count, eq, gte, lt } from "drizzle-orm";

import { db } from "@/db";
import { contacts, organizations } from "@/db/schema";

import type { DashboardScope } from "./dashboard-scope.queries";

/** Contacts and the organization's currency. */
export async function peopleRows({
  context,
  monthStart,
  nextMonthStart,
  previousMonthStart,
  newContactCondition,
  activeLeadCondition,
}: DashboardScope) {
  const [organizationRows, activeLeadRows, newLeadRows, previousLeadRows] = await Promise.all([
    db
      .select({ currency: organizations.currency })
      .from(organizations)
      .where(eq(organizations.id, context.organizationId))
      .limit(1),
    db.select({ value: count() }).from(contacts).where(activeLeadCondition),
    db
      .select({ value: count() })
      .from(contacts)
      .where(
        and(
          newContactCondition,
          gte(contacts.createdAt, monthStart),
          lt(contacts.createdAt, nextMonthStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(contacts)
      .where(
        and(
          newContactCondition,
          gte(contacts.createdAt, previousMonthStart),
          lt(contacts.createdAt, monthStart),
        ),
      ),
  ]);
  return { organizationRows, activeLeadRows, newLeadRows, previousLeadRows };
}
