import { z } from "zod";

const optionalText = (max = 255) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => v || null);
const optionalDate = z
  .union([z.iso.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

export const developmentStatuses = [
  "planning",
  "pre_selling",
  "active",
  "completed",
  "inactive",
] as const;

export const developmentSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(180),
    description: optionalText(10_000),
    status: z.enum(developmentStatuses),
    addressLine1: optionalText(),
    barangay: optionalText(120),
    city: optionalText(120),
    province: optionalText(120),
    postalCode: optionalText(30),
    launchDate: optionalDate,
    completionDate: optionalDate,
  })
  .refine((v) => !v.launchDate || !v.completionDate || v.launchDate <= v.completionDate, {
    path: ["completionDate"],
    message: "Completion must be after the launch date.",
  });

export type DevelopmentInput = z.output<typeof developmentSchema>;
