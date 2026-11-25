import { eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { floors, properties } from "@/db/schema";
import type { FloorSetupInput } from "../schemas/floor-setup.schema";
import { floorLabel } from "./unit-codes";
import { floorLevels, type UnitNumbering } from "./unit-numbering";

/** The property already has floors; later ones are added one by one. */
export class HasFloorsError extends Error {}

/**
 * Builds an empty property's floors and remembers how its units are numbered, so units placed
 * when each floor is designed follow the same pattern. Returns the levels created.
 */
export async function createFloors(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  propertyId: string,
  setup: FloorSetupInput,
): Promise<number[]> {
  const [{ existing }] = await tx
    .select({ existing: sql<number>`count(*)::int` })
    .from(floors)
    .where(eq(floors.buildingId, propertyId));
  if (existing > 0) throw new HasFloorsError();
  const numbering: UnitNumbering = {
    style: setup.style,
    // Units come from designing each floor, so new floors start empty.
    unitsPerFloor: 0,
    endings: setup.style === "custom" ? setup.endings : [],
    skipFloors: setup.skipFloors,
  };
  const levels = floorLevels(setup.fromLevel, setup.toLevel, setup.skipFloors);
  await tx
    .insert(floors)
    .values(levels.map((level) => ({ buildingId: propertyId, level, label: floorLabel(level) })));
  await tx
    .update(properties)
    .set({ unitNumbering: numbering, floorCount: levels.length, updatedAt: new Date() })
    .where(eq(properties.id, propertyId));
  return levels;
}
