import { toAmount, toCents } from "@/lib/utils/money";

/** One row of what an opportunity was quoted: its price and its reservation fee. */
export type QuotedRow = { label: string; price: string | null; reservationFee: string | null };

const amount = (value: number | null) => toAmount(value === null ? null : value / 100);

/**
 * The units' share of a reservation fee that includes parking: the total less the parking fee.
 * Null when nothing is left (only parking sets a fee), so it shows as "—", not ₱0.00.
 */
export function unitsReservationFee(
  total: string | null | undefined,
  parking: string | null | undefined,
): string | null {
  const units = (toCents(total) ?? 0) - (toCents(parking) ?? 0);
  return toCents(total) === null || units <= 0 ? null : amount(units);
}

/**
 * The quoted price and reservation fee, split into units and parking with their totals. The
 * opportunity saves the total price, the parking price, the total fee and the parking fee; the
 * units' share of each is what is left.
 */
export function quotedTerms(input: {
  amount: string | null;
  parkingAmount: string | null;
  reservationFee: string | null;
  parkingReservationFee: string | null;
}): { rows: QuotedRow[]; hasParking: boolean } {
  const total = toCents(input.amount);
  const parking = toCents(input.parkingAmount) ?? 0;
  const feeTotal = toCents(input.reservationFee);
  const parkingFee = toCents(input.parkingReservationFee) ?? 0;
  const hasParking = parking > 0 || parkingFee > 0;
  return {
    hasParking,
    rows: [
      {
        label: "Units",
        price: amount(total === null ? null : total - parking),
        reservationFee: unitsReservationFee(input.reservationFee, input.parkingReservationFee),
      },
      ...(hasParking
        ? [
            {
              label: "Parking",
              price: amount(parking),
              reservationFee: amount(parkingFee || null),
            },
            { label: "Total", price: amount(total), reservationFee: amount(feeTotal) },
          ]
        : []),
    ],
  };
}
