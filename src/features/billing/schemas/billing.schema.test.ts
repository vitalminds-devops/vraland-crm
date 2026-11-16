import { expect, it } from "vitest";
import { manilaDate, manilaToday } from "@/lib/utils/manila-time";
import {
  billItemSchema,
  paymentClassifications,
  paymentClassificationLabels,
  paymentSchema,
} from "./billing.schema";

const payment = {
  billId: "88f50ab3-567a-4a37-9271-eaa92a221995",
  amount: 1000,
  paidOn: "2026-11-07",
  method: "cash",
};

it.each(["reservation", "monthly", "full_payment"])("accepts %s payments", (classification) => {
  expect(paymentSchema.safeParse({ ...payment, classification }).success).toBe(true);
});

it("rejects sub-centavo amounts that would be stored as ₱0.00", () => {
  expect(
    paymentSchema.safeParse({ ...payment, amount: 0.001, classification: "reservation" }).success,
  ).toBe(false);
  expect(
    billItemSchema.safeParse({ unitLabel: "Unit 1", unitPrice: 0.001, miscellaneousFee: 0 })
      .success,
  ).toBe(false);
});

it("rejects payment dates after today in Manila", () => {
  const tomorrow = manilaDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  expect(
    paymentSchema.safeParse({ ...payment, paidOn: tomorrow, classification: "reservation" })
      .success,
  ).toBe(false);
  expect(
    paymentSchema.safeParse({ ...payment, paidOn: manilaToday(), classification: "reservation" })
      .success,
  ).toBe(true);
});

it("rejects new downpayments while keeping their label for saved records", () => {
  expect(paymentClassifications).toEqual(["reservation", "monthly", "full_payment"]);
  expect(paymentSchema.safeParse({ ...payment, classification: "downpayment" }).success).toBe(
    false,
  );
  expect(paymentClassificationLabels.downpayment).toBe("Downpayment");
});

it("accepts centavos but rejects a third decimal place", () => {
  const parse = (amount: number) =>
    paymentSchema.safeParse({ ...payment, amount, classification: "monthly" }).success;
  expect(parse(1234.56)).toBe(true);
  expect(parse(0.29)).toBe(true);
  expect(parse(100.005)).toBe(false);
  expect(
    billItemSchema.safeParse({ unitLabel: "1A", unitPrice: 999.999, miscellaneousFee: 0 }).success,
  ).toBe(false);
});
