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

it("takes a deal's own reservation fee as the total, else sums every unit's building fee", () => {
  const { sql } = render(dealReservationFee);
  expect(sql.indexOf(`"deals"."reservation_fee"`)).toBeLessThan(sql.indexOf("sum("));
  expect(sql).toContain(`select sum(pr."reservation_fee") from "units" u`);
  expect(sql).toContain(`join "properties" pr on pr."id" = u."building_id"`);
  expect(sql).toContain(`u."id" = any("deals"."unit_ids")`);
  // A deal with no unit list falls back to its single unit, then to its property.
  expect(sql).toContain(`cardinality("deals"."unit_ids") = 0 and u."id" = "deals"."unit_id"`);
  expect(sql).toContain(
    `select pr."reservation_fee" from "properties" pr where pr."id" = "deals"."property_id"`,
  );
});

it("sums the monthly amortization over the deal's units the same way", () => {
  const { sql } = render(dealMonthlyAmortization);
  expect(sql).toContain(`select sum(pr."monthly_rent") from "units" u`);
  expect(sql).toContain(
    `select pr."monthly_rent" from "properties" pr where pr."id" = "deals"."property_id"`,
  );
  expect(render(dealFirstMonthPaid).sql).toContain(`select sum(pr."monthly_rent")`);
});

it("ignores removed payments and treats a fully paid bill as passing", () => {
  const { sql } = render(dealFirstMonthPaid);
  expect(sql.match(/p\."deleted_at" is null/g)).toHaveLength(3);
  expect(sql).toContain(`>= b."unit_price" - b."reservation_discount" + b."miscellaneous_fee"`);
});
