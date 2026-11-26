import { expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  dealFirstMonthPaid,
  dealMonthlyAmortization,
  dealReservationFee,
  dealReservationPaid,
  dealReservationReceived,
  billPaid,
  billTotal,
} from "./deal-payment";

const render = (gate: SQL) => new PgDialect().sqlToQuery(gate);

it("opens each gate with its own payment type or a full payment", () => {
  expect(render(dealReservationPaid).params).toEqual(["full_payment", "reservation"]);
  expect(render(dealFirstMonthPaid).params).toEqual(["full_payment", "monthly"]);
});

it("needs reservation payments to add up to the reservation fee", () => {
  const { sql } = render(dealReservationPaid);
  expect(sql).toContain(
    `p."classification" = $2), 0) >= greatest(coalesce(coalesce("deals"."reservation_fee"`,
  );
});

it("adds each parking slot's reservation fee", () => {
  const { sql } = render(dealReservationFee);
  expect(sql).toContain(`select sum(s."reservation_fee") from "parking_slots" s`);
  expect(sql).toContain(`s."id" = any("deals"."parking_slot_ids")`);
  // Neither set stays "no fee", so any reservation payment opens the gate as before.
  expect(sql.replace(/\s+/g, " ")).toMatch(/case when .* is null and .* is null then null/);
});

it("takes a deal's own reservation fee as the total, else sums each unit's type fee", () => {
  const { sql } = render(dealReservationFee);
  expect(sql.indexOf(`"deals"."reservation_fee"`)).toBeLessThan(sql.indexOf("sum("));
  expect(sql).toContain(`select sum(ut."reservation_fee") from "units" u`);
  expect(sql).toContain(`join "unit_types" ut on ut."id" = u."unit_type_id"`);
  expect(sql).toContain(`u."id" = any("deals"."unit_ids")`);
  // A deal with no unit list falls back to its single unit; property-wide fees are not used.
  expect(sql).toContain(`cardinality("deals"."unit_ids") = 0 and u."id" = "deals"."unit_id"`);
  expect(sql).not.toContain(`pr."reservation_fee"`);
});

it("sums each unit's type monthly amortization the same way", () => {
  const { sql } = render(dealMonthlyAmortization);
  expect(sql).toContain(`select sum(ut."monthly_amortization") from "units" u`);
  expect(sql).not.toContain("monthly_rent");
  expect(render(dealFirstMonthPaid).sql).toContain(`sum(ut."monthly_amortization")`);
});

it("ignores removed payments and treats a fully paid bill as passing", () => {
  const { sql } = render(dealFirstMonthPaid);
  expect(sql.match(/p\."deleted_at" is null/g)).toHaveLength(3);
  expect(sql).toContain(
    `>= ("bills"."unit_price" - "bills"."reservation_discount" + "bills"."miscellaneous_fee")`,
  );
});

it("holds units on any reservation payment, even below a fee that rose since", () => {
  const { sql, params } = render(dealReservationReceived);
  expect(params).toEqual(["full_payment", "reservation"]);
  expect(sql).toContain(">= greatest(0, 0.01)");
  expect(sql).not.toContain("reservation_fee");
});

it("sums a bill's live payments and total from the bills row in scope", () => {
  // Table names are explicit, so a payment's own id can never stand in for the bill's.
  expect(render(billPaid()).sql).toContain(`p."bill_id" = "bills"."id" and p."deleted_at" is null`);
  expect(render(billPaid()).params).toEqual([]);
  expect(render(billPaid("reservation")).params).toEqual(["reservation"]);
  expect(render(billTotal).sql).toBe(
    `("bills"."unit_price" - "bills"."reservation_discount" + "bills"."miscellaneous_fee")`,
  );
});
