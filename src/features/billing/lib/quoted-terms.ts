/** One row of what an opportunity was quoted: its price and its reservation fee. */
export type QuotedRow = { label: string; price: string | null; reservationFee: string | null };

const cents = (value: string | null | undefined) =>
  value === null || value === undefined || value === "" ? null : Math.round(Number(value) * 100);
const amount = (value: number | null) => (value === null ? null : (value / 100).toFixed(2));

/**
 * The units' share of a reservation fee that includes parking: the total less the parking fee.
 * Null when nothing is left (only parking sets a fee), so it shows as "—", not ₱0.00.
 */
export function unitsReservationFee(
  total: string | null | undefined,
  parking: string | null | undefined,
): string | null {
  const units = (cents(total) ?? 0) - (cents(parking) ?? 0);
  return cents(total) === null || units <= 0 ? null : amount(units);
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
  const total = cents(input.amount);
  const parking = cents(input.parkingAmount) ?? 0;
  const feeTotal = cents(input.reservationFee);
  const parkingFee = cents(input.parkingReservationFee) ?? 0;
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
