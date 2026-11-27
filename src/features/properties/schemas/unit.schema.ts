import { z } from "zod";
import { unitStatuses } from "../lib/unit-codes";

export const statusSchema = z.object({
  unitId: z.uuid(),
  status: z.enum(unitStatuses),
});

export const addCountSchema = z.number().int().min(1).max(100);

export const unitsEachSchema = z.number().int().min(0).max(100);

export const floorNameSchema = z.object({
  floorId: z.uuid(),
  label: z
    .string()
    .trim()
    .min(1, "Enter a floor name.")
    .max(60, "Keep the name under 60 characters."),
});

export const renameSchema = z.object({
  unitId: z.uuid(),
  code: z
    .string()
    .trim()
    .min(1, "Enter a unit name.")
    .max(50, "Keep the name under 50 characters."),
});

export const unitIdSchema = z.uuid();
