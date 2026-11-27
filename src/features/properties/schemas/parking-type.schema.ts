import { z } from "zod";

/** An amount typed in a money field; blank is no amount (null), not zero. */
const amount = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.coerce.number().nonnegative("Enter an amount of zero or more.").nullable(),
);

export const parkingTypeSchema = z.object({
  propertyId: z.uuid(),
  /** Missing for a new type. */
  id: z.string().min(1).max(40).optional(),
  name: z
    .string()
    .trim()
    .min(1, "Name the parking type.")
    .max(40, "Keep names under 40 characters."),
  w: z.coerce.number().min(1, "Width is 1–8 m.").max(8, "Width is 1–8 m."),
  h: z.coerce.number().min(2, "Length is 2–15 m.").max(15, "Length is 2–15 m."),
  price: amount,
  reservationFee: amount,
  monthlyAmortization: amount,
});
