import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { billItems, bills, deals, units } from "@/db/schema";
import { hasPermission, type AuthorizationContext } from "@/lib/permissions/policy";

/**
 * The prices this property's units are billed at on open opportunities, by unit. A unit still on
 * sale can sit on several bills, each holding the price agreed when it was billed. Empty for users
 * who can't see Billing.
 */
export async function getBilledUnitPrices(
  context: AuthorizationContext,
  propertyId: string,
): Promise<Record<string, string[]>> {
  if (!hasPermission(context, "billing.view")) return {};
  const rows = await db
    .selectDistinct({ unitId: billItems.unitId, price: billItems.unitPrice })
    .from(billItems)
    .innerJoin(bills, eq(billItems.billId, bills.id))
    .innerJoin(deals, eq(bills.dealId, deals.id))
    .innerJoin(units, eq(billItems.unitId, units.id))
    .where(
      and(
        eq(units.propertyId, propertyId),
        eq(deals.organizationId, context.organizationId),
        eq(deals.status, "open"),
        isNull(deals.deletedAt),
      ),
    )
    .limit(500);
  const byUnit: Record<string, string[]> = {};
  for (const row of rows) if (row.unitId) (byUnit[row.unitId] ??= []).push(row.price);
  return byUnit;
}
