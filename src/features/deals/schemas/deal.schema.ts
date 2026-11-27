import { z } from "zod";
import { propertyTransactionTypes } from "@/features/properties/lib/constants";

const optionalMoney = z
  .union([z.coerce.number().min(0), z.literal(""), z.null()])
  .transform((value) => (value === "" ? null : value));

export const contactDealSchema = z.object({
  dealType: z.enum(propertyTransactionTypes),
  stageId: z.uuid(),
  amount: optionalMoney,
  expectedCommission: optionalMoney,
  expectedCloseDate: z.union([z.iso.date(), z.literal("")]).transform((value) => value || null),
});

export type ContactDealInput = z.input<typeof contactDealSchema>;

export const stageChangeSchema = z.object({
  dealId: z.uuid(),
  stageId: z.uuid(),
  note: z.string().trim().max(500).optional().default(""),
  expectedUpdatedAt: z.iso.datetime().optional(),
});
export const lostDealSchema = z.object({
  dealId: z.uuid(),
  lostReasonId: z.uuid(),
  notes: z.string().trim().max(2000).optional().default(""),
});

export const stageApprovalSchema = z.object({
  requestId: z.uuid(),
  note: z.string().trim().max(500).optional().default(""),
});

export const dealDeleteSchema = z.object({ dealId: z.uuid() });

/** Recalculating a won opportunity's commission by today's rules. */
export const commissionRecalculationSchema = z.object({ dealId: z.uuid() });
