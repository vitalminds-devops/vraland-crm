import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { db } from "@/db";
import { deals } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The opportunity still holding a unit or parking slot, or null when it is free to change by hand.
 * An open or won opportunity owns its inventory; only a lost, cancelled or deleted one lets go.
 */
export async function activeHold(tx: Tx, reservedDealId: string | null) {
  if (!reservedDealId) return null;
  const [deal] = await tx
    .select({ code: deals.dealCode, status: deals.status })
    .from(deals)
    .where(and(eq(deals.id, reservedDealId), isNull(deals.deletedAt)))
    .limit(1);
  return deal && (deal.status === "open" || deal.status === "won") ? deal : null;
}

/** Thrown inside a transaction to roll it back with a message for the person. */
export class InventoryHeldError extends Error {}

export const heldMessage = (what: string, dealCode: string) =>
  `${what} belongs to opportunity ${dealCode}. Change it from that opportunity.`;
