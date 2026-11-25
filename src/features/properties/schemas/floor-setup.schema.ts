import { z } from "zod";
import { MAX_SETUP_FLOORS, MAX_UNITS_PER_FLOOR, floorLevels } from "../lib/unit-numbering";

const level = z
  .number()
  .int()
  .min(1, "Enter floor 1 or higher.")
  .max(999, "Use floor 999 or lower.");

/** The property form's Floors section: which floors to build and how their units are numbered. */
export const floorSetupSchema = z
  .object({
    fromLevel: level,
    toLevel: level,
    skipFloors: z.array(level).max(50),
    style: z.enum(["letter", "number", "custom"]),
    endings: z
      .array(z.string().regex(/^[0-9A-Z]{1,4}$/))
      .max(MAX_UNITS_PER_FLOOR, `Use at most ${MAX_UNITS_PER_FLOOR} unit identifiers per floor.`),
  })
  .superRefine((value, ctx) => {
    if (value.toLevel < value.fromLevel)
      ctx.addIssue({
        code: "custom",
        path: ["toLevel"],
        message: "End at or above the starting floor.",
      });
    const count = floorLevels(value.fromLevel, value.toLevel, value.skipFloors).length;
    if (count === 0)
      ctx.addIssue({ code: "custom", path: ["skipFloors"], message: "Every floor is skipped." });
    if (count > MAX_SETUP_FLOORS)
      ctx.addIssue({
        code: "custom",
        path: ["toLevel"],
        message: `Set up at most ${MAX_SETUP_FLOORS} floors at once.`,
      });
    if (value.style === "custom" && value.endings.length === 0)
      ctx.addIssue({ code: "custom", path: ["endings"], message: "Enter the unit endings." });
  });

export type FloorSetupInput = z.output<typeof floorSetupSchema>;
