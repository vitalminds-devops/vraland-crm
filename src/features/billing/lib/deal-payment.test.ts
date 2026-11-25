import { expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  dealFirstMonthPaid,
  dealMonthlyAmortization,
  dealReservationFee,
  dealReservationPaid,
} from "./deal-payment";

const render = (gate: SQL) => new PgDialect().sqlToQuery(gate);

it("opens each gate with its own payment type or a full payment", () => {
  expect(render(dealReservationPaid).params).toEqual(["reservation"]);
  expect(render(dealFirstMonthPaid).params).toEqual(["monthly"]);
  expect(render(dealReservationPaid).sql).toContain(`p."classification" = 'full_payment'`);
});

it("needs reservation payments to add up to the reservation fee", () => {
  const { sql } = render(dealReservationPaid);
  expect(sql).toContain(`p."classification" = $1
    ) >= greatest(coalesce(coalesce("deals"."reservation_fee"`);
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
  expect(sql).toContain(`>= b."unit_price" - b."reservation_discount" + b."miscellaneous_fee"`);
});
