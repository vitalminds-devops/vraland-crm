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
 * An amount set per unit on each property, summed over the deal's units at each unit's own
 * building's amount; a deal with no units uses its property's. Null when none is set.
 */
const perUnit = (column: "reservation_fee" | "monthly_rent") => {
  const amount = sql.raw(`pr."${column}"`);
  return sql`coalesce(
  (select sum(${amount}) from "units" u join "properties" pr on pr."id" = u."building_id"
    where u."id" = any("deals"."unit_ids")
      or (cardinality("deals"."unit_ids") = 0 and u."id" = "deals"."unit_id")),
  (select ${amount} from "properties" pr where pr."id" = "deals"."property_id"))`;
};

/** The reservation fee Billing shows and the gate needs: the deal's own total, else every unit's fee. */
export const dealReservationFee = sql<
  string | null
>`coalesce("deals"."reservation_fee", ${perUnit("reservation_fee")})`;
/** The monthly amortization Billing shows and the gate needs: every unit's monthly amount. */
export const dealMonthlyAmortization = sql<string | null>`${perUnit("monthly_rent")}`;

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
