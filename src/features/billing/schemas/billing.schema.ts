import { z } from "zod";
import { manilaToday } from "@/lib/utils/manila-time";
import { billApplicantSchema } from "./bill-applicant.schema";

export const paymentMethods = [
  "cash",
  "bank_financing",
  "pag_ibig",
  "in_house_financing",
  "other",
  "online",
  "bank_transfer",
  "check",
] as const;

/**
 * A Reservation unlocks the Reservation stage; the first Monthly unlocks Won.
 * A Full payment settles the balance, so it counts for both.
 */
export const paymentClassifications = ["reservation", "monthly", "full_payment"] as const;

const MAX_AMOUNT = 9_999_999_999_999;
/** Pesos and centavos only: more decimals would make totals and stored amounts drift apart. */
const centavos = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const CENTAVOS_MESSAGE = "Use at most 2 decimal places.";
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);

export const billItemSchema = z.object({
  unitLabel: z.string().trim().min(1, "Enter the unit, e.g. Unit 205 Tower 1.").max(220),
  unitPrice: z.coerce
    .number({ error: "Enter the unit price." })
    .min(0.01, "Enter the unit price.")
    .max(MAX_AMOUNT)
    .refine(centavos, CENTAVOS_MESSAGE),
  miscellaneousFee: z.coerce
    .number({ error: "Enter the miscellaneous fee, or 0." })
    .min(0, "The miscellaneous fee cannot be negative.")
    .max(MAX_AMOUNT)
    .refine(centavos, CENTAVOS_MESSAGE),
});

export const billSchema = z.object({
  dealId: z.uuid(),
  applicantDetails: billApplicantSchema.optional(),
  items: z
    .array(billItemSchema)
    .min(1, "Add at least one unit.")
    .max(50, "A bill can have at most 50 units."),
  /** Omitted by forms that do not show it, which keeps the saved discount. */
  reservationDiscount: z.coerce
    .number({ error: "Enter the reservation discount, or 0." })
    .min(0, "The reservation discount cannot be negative.")
    .max(MAX_AMOUNT)
    .refine(centavos, CENTAVOS_MESSAGE)
    .optional(),
  notes: optionalText(2000),
});

export const paymentSchema = z.object({
  billId: z.uuid({ error: "Select the bill this payment is for." }),
  amount: z.coerce
    .number({ error: "Enter the amount paid." })
    .min(0.01, "Enter the amount paid.")
    .max(MAX_AMOUNT)
    .refine(centavos, CENTAVOS_MESSAGE),
  paidOn: z.iso
    .date({ error: "Enter the payment date." })
    .refine((date) => date <= manilaToday(), "The payment date cannot be in the future."),
  method: z.enum(paymentMethods, { error: "Select how it was paid." }),
  classification: z.enum(paymentClassifications, {
    error: "Select what the payment is for.",
  }),
  referenceNo: optionalText(120),
  notes: optionalText(2000),
});

export const removePaymentSchema = z.object({ id: z.uuid() });

export const paymentClassificationLabels: Record<
  (typeof paymentClassifications)[number] | "downpayment",
  string
> = {
  reservation: "Reservation",
  downpayment: "Downpayment",
  monthly: "Monthly",
  full_payment: "Full payment",
};

export const paymentMethodLabels: Record<(typeof paymentMethods)[number], string> = {
  cash: "Cash",
  bank_financing: "Bank financing",
  pag_ibig: "Pag-IBIG financing",
  in_house_financing: "In-house financing",
  other: "Other",
  bank_transfer: "Bank transfer",
  check: "Check",
  online: "Online",
};
