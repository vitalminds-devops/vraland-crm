import { isHeld } from "./unit-codes";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import { deals, parkingSlots } from "@/db/schema";

/**
 * Why these slots must stay, or null: a reserved or sold slot, or one an open opportunity
 * includes, is part of a sale, so removing it would lose that record.
 */
export async function parkingRemovalBlocker(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  slotIds: string[],
): Promise<string | null> {
  if (!slotIds.length) return null;
  const slots = await tx
    .select({
      id: parkingSlots.id,
      code: parkingSlots.identifier,
      status: parkingSlots.status,
      reservedDealId: parkingSlots.reservedDealId,
    })
    .from(parkingSlots)
    .where(inArray(parkingSlots.id, slotIds))
    .for("update");
  const taken = slots.find((slot) => isHeld(slot.status) || slot.reservedDealId);
  if (taken)
    return `Parking ${taken.code} is ${taken.status === "sold" ? "sold" : "reserved"}, so it cannot be removed.`;
  const [linked] = await tx
    .select({ dealCode: deals.dealCode, slotIds: deals.parkingSlotIds })
    .from(deals)
    .where(
      and(
        sql`${deals.parkingSlotIds} && array[${sql.join(
          slotIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]`,
        eq(deals.status, "open"),
        isNull(deals.deletedAt),
      ),
    )
    .limit(1);
  if (!linked) return null;
  const slot = slots.find((candidate) => linked.slotIds?.includes(candidate.id));
  return `Parking ${slot?.code ?? "slot"} is on open opportunity ${linked.dealCode}, so it cannot be removed.`;
}
