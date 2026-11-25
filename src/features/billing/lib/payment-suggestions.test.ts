import { expect, it } from "vitest";
import { paymentSuggestions, refilledAmount } from "./payment-suggestions";

const base = {
  reservationFee: "15000",
  monthlyAmortization: "25000",
  balance: 3000000,
  payments: [] as { amount: string; classification: string }[],
};

it("suggests the reservation fee still due, a month, and the whole balance", () => {
  expect(paymentSuggestions(base)).toEqual({
    reservation: "15000.00",
    monthly: "25000.00",
    full_payment: "3000000.00",
  });
  const partly = paymentSuggestions({
    ...base,
    payments: [
      { amount: "5000", classification: "reservation" },
      { amount: "25000", classification: "monthly" },
    ],
  });
  expect(partly.reservation).toBe("10000.00");
});

it("suggests nothing for a fee that's paid, unset, or more than the balance allows", () => {
  const paid = paymentSuggestions({
    ...base,
    payments: [{ amount: "15000", classification: "reservation" }],
  });
  expect(paid.reservation).toBeNull();
  expect(
    paymentSuggestions({ ...base, reservationFee: null, monthlyAmortization: null }),
  ).toMatchObject({
    reservation: null,
    monthly: null,
  });
  // Never more than what's left on the bill.
  expect(paymentSuggestions({ ...base, balance: 8000 }).monthly).toBe("8000.00");
});

it("refills the amount from a new suggestion but keeps what the agent typed", () => {
  expect(refilledAmount("", null, "20000.00")).toEqual({
    amount: "20000.00",
    suggested: "20000.00",
  });
  // Reservation, then Monthly with no monthly amount set: the old suggestion is cleared.
  expect(refilledAmount("20000.00", "20000.00", null)).toEqual({ amount: "", suggested: null });
  expect(refilledAmount("20000.00", "20000.00", "8000.00").amount).toBe("8000.00");
  expect(refilledAmount("15000", "20000.00", "8000.00")).toEqual({
    amount: "15000",
    suggested: "20000.00",
  });
});
