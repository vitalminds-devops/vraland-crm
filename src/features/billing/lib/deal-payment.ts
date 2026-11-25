import { sql, type SQL } from "drizzle-orm";

/**
 * Whether the opportunity's bill has live payments of this classification adding up to `due`
 * (at least one centavo), a full payment, or is paid in full: a settled bill takes no more
 * payments, so it must not leave the lead stuck behind a gate.
 * Written with explicit table names: drizzle drops them in single-table selects, which made `id` ambiguous.
 */
const dealPaidAs = (classification: string, due: SQL) => sql<boolean>`exists (
  select 1 from "bills" b
  where b."deal_id" = "deals"."id" and (
    exists (
      select 1 from "payments" p
      where p."bill_id" = b."id" and p."deleted_at" is null
        and p."classification" = 'full_payment'
    )
    or (
      select coalesce(sum(p."amount"), 0) from "payments" p
      where p."bill_id" = b."id" and p."deleted_at" is null
        and p."classification" = ${classification}
    ) >= greatest(${due}, 0.01)
    or (
      select coalesce(sum(p."amount"), 0) from "payments" p
      where p."bill_id" = b."id" and p."deleted_at" is null
    ) >= b."unit_price" - b."reservation_discount" + b."miscellaneous_fee"
  )
)`;

/**
 * An amount set on each unit type, summed over the deal's units (a deal without a unit list uses
 * its single unit). Null when none of them sets it. Property-wide amounts are no longer used.
 */
const perUnit = (column: "reservation_fee" | "monthly_amortization") => {
  const typeAmount = sql.raw(`ut."${column}"`);
  return sql`(select sum(${typeAmount}) from "units" u
    join "unit_types" ut on ut."id" = u."unit_type_id"
    where u."id" = any("deals"."unit_ids")
      or (cardinality("deals"."unit_ids") = 0 and u."id" = "deals"."unit_id"))`;
};

/** The reservation fees of the deal's parking slots. */
export const parkingReservationFee = sql`(select sum(s."reservation_fee") from "parking_slots" s
  where s."id" = any("deals"."parking_slot_ids"))`;

/**
 * The reservation fee Billing shows and the gate needs: the deal's own total, else every unit's fee
 * plus every parking slot's. Null when none is set.
 */
export const dealReservationFee = sql<string | null>`coalesce("deals"."reservation_fee",
  case when ${perUnit("reservation_fee")} is null and ${parkingReservationFee} is null then null
  else coalesce(${perUnit("reservation_fee")}, 0) + coalesce(${parkingReservationFee}, 0) end)`;
/** The monthly amortization Billing shows and the gate needs: the amount quoted, else every unit's. */
export const dealMonthlyAmortization = sql<
  string | null
>`coalesce("deals"."monthly_amortization", ${perUnit("monthly_amortization")})`;

/** Reservation payments covering the reservation fee (or a Full payment) unlock Opportunity → Reservation; none set means any amount. */
export const dealReservationPaid = dealPaidAs(
  "reservation",
  sql`coalesce(${dealReservationFee}, 0)`,
);
/** Monthly payments covering the monthly amortization (or a Full payment) unlock Reservation → Won; none set means any amount. */
export const dealFirstMonthPaid = dealPaidAs(
  "monthly",
  sql`coalesce(${dealMonthlyAmortization}, 0)`,
);
