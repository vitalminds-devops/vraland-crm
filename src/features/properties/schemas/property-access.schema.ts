import { z } from "zod";

export const grantSchema = z.object({
  propertyId: z.uuid(),
  userId: z.uuid(),
  floorIds: z.array(z.uuid()).max(500).default([]),
  unitIds: z.array(z.uuid()).max(2000).default([]),
  excludedUnitIds: z.array(z.uuid()).max(2000).default([]),
  parkingSlotIds: z.array(z.uuid()).max(2000).default([]),
});

export const clearSchema = z.object({
  propertyId: z.uuid(),
  userId: z.uuid(),
});

export const bulkSchema = z.object({
  /** One person, or every non-administrator in the organization. */
  userId: z.uuid().optional(),
  everyone: z.boolean().default(false),
});
