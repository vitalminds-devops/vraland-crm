import { sql, type SQL } from "drizzle-orm";

/**
 * A bill's total: unit prices less the reservation discount, plus miscellaneous fees. Reads the
 * `bills` row in scope, so the outer query must select from `bills` (not an alias).
 */
export const billTotal = sql<string>`("bills"."unit_price" - "bills"."reservation_discount" + "bills"."miscellaneous_fee")`;

/** What the `bills` row in scope has been paid with live payments, optionally of one classification. */
export const billPaid = (classification?: string) =>
  sql<string>`coalesce((select sum(p."amount") from "payments" p
    where p."bill_id" = "bills"."id" and p."deleted_at" is null${
      classification ? sql` and p."classification" = ${classification}` : sql``
    }), 0)`;

/**
 * Whether the opportunity's bill has live payments of this classification adding up to `due`
 * (at least one centavo), a full payment, or is paid in full: a settled bill takes no more
 * payments, so it must not leave the lead stuck behind a gate.
 * Written with explicit table names: drizzle drops them in single-table selects, which made `id` ambiguous.
 */
const dealPaidAs = (classification: string, due: SQL) => sql<boolean>`exists (
  select 1 from "bills"
  where "bills"."deal_id" = "deals"."id" and (
    ${billPaid("full_payment")} > 0
    or ${billPaid(classification)} >= greatest(${due}, 0.01)
    or ${billPaid()} >= ${billTotal}
  )
)`;

/**
 * An amount set on each unit type, summed over the deal's units. Null when none of them sets it. Property-wide amounts are no longer used.
 */
const perUnit = (column: "reservation_fee" | "monthly_amortization") => {
  const typeAmount = sql.raw(`ut."${column}"`);
  return sql`(select sum(${typeAmount}) from "units" u
    join "unit_types" ut on ut."id" = u."unit_type_id"
    where u."id" = any("deals"."unit_ids"))`;
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
/**
 * Any live reservation (or full) payment at all. Holds the units even when the fee quoted later
 * rose (a unit or slot added), so paid-for units never go back on sale while money is held.
 */
export const dealReservationReceived = dealPaidAs("reservation", sql`0`);
/** Monthly payments covering the monthly amortization (or a Full payment) unlock Reservation → Won; none set means any amount. */
export const dealFirstMonthPaid = dealPaidAs(
  "monthly",
  sql`coalesce(${dealMonthlyAmortization}, 0)`,
);
