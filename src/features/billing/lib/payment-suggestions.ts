/**
 * What Record payment fills in for each kind of payment: the reservation fee still due, one month
 * of amortization, or the whole balance. Null where there is nothing to suggest.
 */
export function paymentSuggestions(input: {
  reservationFee: string | null;
  monthlyAmortization: string | null;
  balance: number;
  payments: readonly { amount: string; classification: string }[];
}): Record<"reservation" | "monthly" | "full_payment", string | null> {
  const cents = (value: string | number) => Math.round(Number(value) * 100);
  const paidAsReservation = input.payments
    .filter((payment) => payment.classification === "reservation")
    .reduce((sum, payment) => sum + cents(payment.amount), 0);
  const balance = Math.max(0, cents(input.balance));
  const capped = (amount: number) =>
    amount > 0 ? (Math.min(amount, balance) / 100).toFixed(2) : null;
  return {
    reservation: input.reservationFee
      ? capped(cents(input.reservationFee) - paidAsReservation)
      : null,
    monthly: input.monthlyAmortization ? capped(cents(input.monthlyAmortization)) : null,
    full_payment: capped(balance),
  };
}

/**
 * The amount box after the bill or payment type changes: the new suggestion replaces an empty box
 * or the previous suggestion (cleared when there is none), but never an amount the agent typed.
 */
export function refilledAmount(
  current: string,
  lastSuggested: string | null,
  suggestion: string | null,
): { amount: string; suggested: string | null } {
  const untouched = current === "" || current === lastSuggested;
  return untouched
    ? { amount: suggestion ?? "", suggested: suggestion }
    : { amount: current, suggested: lastSuggested };
}
