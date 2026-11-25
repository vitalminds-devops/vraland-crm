import { z } from "zod";
import {
  groupColors,
  groupSides,
  sidesOverlap,
  type GroupColor,
  type GroupSide,
} from "../lib/floor-groups";

const floorGroupSchema = z.object({
  // 64, not 40: sections made from old side names have ids like "even-<uuid>" (41).
  id: z.string().min(1).max(64),
  name: z
    .string()
    .trim()
    .min(1, "Name each section.")
    .max(40, "Keep section names under 40 characters."),
  color: z.enum(groupColors.map((option) => option.value) as [GroupColor, ...GroupColor[]]),
  floorIds: z.array(z.uuid()).min(1, "Pick at least one floor for each section.").max(300),
  endings: z.array(z.string().trim().min(1).max(10)).max(100).default([]),
  side: z
    .enum(groupSides.map((option) => option.value) as [GroupSide, ...GroupSide[]])
    .default("all"),
});

/**
 * How a property names its units: the numbering style for new units, and its floor groups.
 * Either part may be left out; only what is sent is saved.
 */
export const unitNamingSchema = z
  .object({
    propertyId: z.uuid(),
    style: z.enum(["letter", "number", "custom"]).optional(),
    endings: z
      .array(z.string().regex(/^[0-9A-Z]{1,4}$/))
      .max(60)
      .default([]),
    floorGroups: z.array(floorGroupSchema).max(30).optional(),
  })
  .refine(
    (value) =>
      (value.floorGroups ?? []).every((group) => group.side !== "pick" || group.endings.length > 0),
    {
      path: ["floorGroups"],
      message: "Pick at least one unit for each section.",
    },
  )
  .refine((value) => value.style !== "custom" || value.endings.length > 0, {
    path: ["endings"],
    message: "Enter the unit endings.",
  })
  .refine(
    // Two sections may share a floor only when one takes its odd units and the other its even.
    (value) =>
      (value.floorGroups ?? []).every((group, index, all) =>
        all
          .slice(index + 1)
          .every(
            (other) =>
              !sidesOverlap(group, other) ||
              !group.floorIds.some((id) => other.floorIds.includes(id)),
          ),
      ),
    {
      path: ["floorGroups"],
      message: "A unit can be in one section only. Two sections on one floor need different units.",
    },
  );

export type UnitNamingInput = z.input<typeof unitNamingSchema>;
