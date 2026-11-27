import { eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { floors, properties } from "@/db/schema";
import type { FloorSetupInput } from "../schemas/floor-setup.schema";
import { floorLabel } from "./unit-codes";
import { floorLevels, type UnitIdentifier } from "./unit-identifier";

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
    .where(eq(floors.propertyId, propertyId));
  if (existing > 0) throw new HasFloorsError();
  const numbering: UnitIdentifier = {
    style: setup.style,
    // Units come from designing each floor, so new floors start empty.
    unitsPerFloor: 0,
    endings: setup.style === "custom" ? setup.endings : [],
    skipFloors: setup.skipFloors,
  };
  const levels = floorLevels(setup.fromLevel, setup.toLevel, setup.skipFloors);
  await tx
    .insert(floors)
    .values(levels.map((level) => ({ propertyId: propertyId, level, label: floorLabel(level) })));
  await tx
    .update(properties)
    .set({ unitIdentifier: numbering, floorCount: levels.length, updatedAt: new Date() })
    .where(eq(properties.id, propertyId));
  return levels;
}
