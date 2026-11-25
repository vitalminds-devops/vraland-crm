/** One row of what an opportunity was quoted: its price and its reservation fee. */
export type QuotedRow = { label: string; price: string | null; reservationFee: string | null };

const cents = (value: string | null | undefined) =>
  value === null || value === undefined || value === "" ? null : Math.round(Number(value) * 100);
const amount = (value: number | null) => (value === null ? null : (value / 100).toFixed(2));

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
        reservationFee: amount(feeTotal === null ? null : feeTotal - parkingFee),
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
