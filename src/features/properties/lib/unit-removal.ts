import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { db } from "@/db";
import { deals, units } from "@/db/schema";

/**
 * Why these units must stay, or null: a reserved or sold unit, or one an open deal is for,
 * is part of a sale, so removing it would lose that record.
 */
export async function removalBlocker(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  unitIds: string[],
): Promise<string | null> {
  if (!unitIds.length) return null;
  const rows = await tx
    .select({
      code: units.code,
      status: units.status,
      reservedDealId: units.reservedDealId,
      dealCode: deals.dealCode,
    })
    .from(units)
    .leftJoin(
      deals,
      and(
        or(eq(deals.unitId, units.id), sql`${units.id} = any(${deals.unitIds})`),
        eq(deals.status, "open"),
        isNull(deals.deletedAt),
      ),
    )
    .where(inArray(units.id, unitIds))
    .orderBy(asc(units.id))
    .for("update", { of: units });
  const sold = rows.find(
    (row) => row.status === "deposit_paid" || row.status === "sold" || row.reservedDealId,
  );
  if (sold)
    return `Unit ${sold.code} is ${sold.status === "sold" ? "sold" : "reserved"}, so it cannot be removed. Mark it Available or Inactive first.`;
  const inDeal = rows.find((row) => row.dealCode);
  if (inDeal)
    return `Unit ${inDeal.code} is on open opportunity ${inDeal.dealCode}, so it cannot be removed.`;
  return null;
}
