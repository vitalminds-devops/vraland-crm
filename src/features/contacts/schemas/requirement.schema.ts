import { z } from "zod";
import { defaultRequirementStatus, requirementStatuses } from "../lib/contact-options";

export const requirementCreateSchema = z.object({
  contactId: z.uuid(),
  documentType: z.string().trim().min(1).max(80),
  label: z.string().trim().min(2).max(180),
  status: z.enum(requirementStatuses).default(defaultRequirementStatus),
  notes: z
    .union([z.string().trim().max(1000), z.literal(""), z.null()])
    .optional()
    .transform((value) => value || null),
});

export const requirementDeleteSchema = z.object({ id: z.uuid() });

export const requirementSeedSchema = z.object({ contactId: z.uuid() });
