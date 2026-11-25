import { z } from "zod";

/** An amount typed in a money field; blank is no amount (null), not zero. */
const optionalNonnegative = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.coerce.number().nonnegative("Enter an amount of zero or more.").nullable(),
);

/** One parking slot's price and reservation fee; blank is none. */
export const slotPricesSchema = z.object({
  slotId: z.uuid(),
  price: optionalNonnegative,
  reservationFee: optionalNonnegative,
});
