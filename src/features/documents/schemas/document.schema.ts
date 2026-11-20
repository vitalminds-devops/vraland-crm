import { z } from "zod";
import { documentTypeOptions } from "@/features/contacts/lib/contact-options";
const optionalUuid = z.union([z.uuid(), z.literal(""), z.null()]).transform((v) => v || null);
export const documentMetadataSchema = z.object({
  library: z.enum(["record", "shared"]).default("record"),
  // Blank names fall back to the type's label.
  name: z.string().trim().max(220).optional().default(""),
  documentType: z.enum(
    documentTypeOptions.map((item) => item.documentType) as [string, ...string[]],
  ),
  contactId: optionalUuid,
  propertyId: optionalUuid,
  dealId: optionalUuid,
});
