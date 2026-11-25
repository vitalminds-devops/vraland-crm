import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { floors } from "@/db/schema";
import { withoutRemoved } from "./floor-layout";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Takes removed units and parking slots off their floors' plans, so a plan never shows a spot
 * for something gone, and saving the floor doesn't bring it back.
 */
export async function dropFromFloorPlans(
  tx: Tx,
  floorIds: readonly (string | null)[],
  removed: { unitIds?: string[]; slotIds?: string[] },
) {
  const ids = [...new Set(floorIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const rows = await tx
    .select({ id: floors.id, layout: floors.layout })
    .from(floors)
    .where(inArray(floors.id, ids))
    .for("update");
  for (const row of rows) {
    if (!row.layout) continue;
    await tx
      .update(floors)
      .set({ layout: withoutRemoved(row.layout, removed), updatedAt: new Date() })
      .where(inArray(floors.id, [row.id]));
  }
}
