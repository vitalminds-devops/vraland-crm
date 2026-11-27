import { z } from "zod";
import { propertyTypes, propertyTransactionTypes } from "../lib/constants";

const optionalText = (max = 255) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => v || null);
const optionalNumber = z
  .union([z.coerce.number(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));
const optionalNonnegative = z
  .union([z.coerce.number().nonnegative(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));
const optionalDate = z
  .union([z.iso.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);
const optionalUuid = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

const optionalCount = z
  .union([z.literal(""), z.null(), z.coerce.number().int().min(1).max(200)])
  .optional()
  .transform((v) => (v === "" || v === null || v === undefined ? null : v));

export const propertySchema = z
  .object({
    developmentId: optionalUuid,
    title: z.string().trim().min(1, "Enter the property name.").max(220),
    description: optionalText(10_000),
    propertyType: z.enum(propertyTypes),
    listingType: z.enum(propertyTransactionTypes),
    status: z.enum([
      "draft",
      "active",
      "reserved",
      "pending",
      "under_contract",
      "sold",
      "rented",
      "withdrawn",
      "inactive",
    ]),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .transform((v) => v.toUpperCase()),
    parkingSlotLimit: optionalNonnegative,
    addressLine1: optionalText(),
    addressLine2: optionalText(),
    barangay: optionalText(120),
    city: optionalText(120),
    province: optionalText(120),
    postalCode: optionalText(30),
    latitude: optionalNumber,
    longitude: optionalNumber,
    listedAt: optionalDate,
    availableFrom: optionalDate,
    contractStartDate: optionalDate,
    contractEndDate: optionalDate,
    floorCount: optionalCount,
    unitsPerFloor: optionalCount,
    unitIdentifierStyle: z.literal("letter"),
    features: z.string().trim().max(1000).optional().default(""),
  })
  .refine((v) => !v.floorCount || !!v.unitsPerFloor, {
    path: ["unitsPerFloor"],
    message: "Enter units per floor to create the units.",
  })
  .refine((v) => !v.unitsPerFloor || !!v.floorCount, {
    path: ["floorCount"],
    message: "Enter the number of floors to create the units.",
  })
  .refine((v) => v.latitude === null || (v.latitude >= -90 && v.latitude <= 90), {
    path: ["latitude"],
    message: "Latitude must be between -90 and 90.",
  })
  .refine((v) => v.longitude === null || (v.longitude >= -180 && v.longitude <= 180), {
    path: ["longitude"],
    message: "Longitude must be between -180 and 180.",
  })
  .refine(
    (v) => !v.contractStartDate || !v.contractEndDate || v.contractStartDate <= v.contractEndDate,
    { path: ["contractEndDate"], message: "Contract end must be after the start date." },
  );

export type PropertyInput = z.output<typeof propertySchema>;
