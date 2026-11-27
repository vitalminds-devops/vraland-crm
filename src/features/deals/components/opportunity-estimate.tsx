"use client";

import { unitsReservationFee } from "@/features/billing/lib/quoted-terms";
import { cn } from "@/lib/utils/cn";
import { formatAmount } from "@/lib/utils/money";

import type { getOpportunityEstimate } from "../actions/opportunity.actions";

export type OpportunityEstimate = Awaited<ReturnType<typeof getOpportunityEstimate>>;

/** The expected amount for the picked units and parking, or why it can't be worked out yet. */
export function OpportunityEstimatePanel({
  estimate,
  propertyId,
  unitIds,
  onUnitIdsChange,
  droppedPicks,
}: {
  estimate: OpportunityEstimate | null;
  propertyId: string | null;
  unitIds: string[];
  onUnitIdsChange: (ids: string[]) => void;
  droppedPicks: number;
}) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4" aria-live="polite">
      <h3 className="text-sm font-semibold">Expected amount</h3>
      {estimate?.success ? (
        <dl className="mt-3 grid gap-2 text-sm">
          {/* A line per unit and slot, so differing prices are all visible. */}
          {[
            ...estimate.selectedUnits.map((unit) => ({
              label: `Unit ${unit.code}`,
              price: unit.price,
            })),
            ...estimate.selectedSlots.map((slot) => ({
              label: `Parking ${slot.code}`,
              price: slot.price,
            })),
          ].map((line) => (
            <div key={line.label} className="flex justify-between gap-3">
              <dt>{line.label}</dt>
              <dd className="tabular-nums">{formatAmount(line.price ?? "0", estimate.currency)}</dd>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-3 border-t border-primary/20 pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd className="text-primary tabular-nums">
              {formatAmount(estimate.total, estimate.currency)}
            </dd>
          </div>
          {/* What the opportunity will be quoted, saved with it. */}
          {(
            [
              ...(estimate.parkingReservationFee
                ? ([
                    [
                      "Unit reservation fee",
                      unitsReservationFee(estimate.reservationFee, estimate.parkingReservationFee),
                    ],
                    ["Parking reservation fee", estimate.parkingReservationFee],
                  ] as const)
                : ([["Reservation fee", estimate.reservationFee]] as const)),
              ["Monthly amortization", estimate.monthlyAmortization],
            ] as const
          ).map(([label, amount]) => (
            <div key={label} className="flex justify-between gap-3 text-muted-foreground">
              <dt>{label}</dt>
              <dd className="tabular-nums">
                {amount ? formatAmount(amount, estimate.currency) : "—"}
              </dd>
            </div>
          ))}
          {estimate.missingFee && (
            <p role="note" className="text-xs text-amber-700 dark:text-amber-400">
              {estimate.missingFee}
            </p>
          )}
        </dl>
      ) : (
        <p className={cn("mt-2 text-sm", estimate ? "text-destructive" : "text-muted-foreground")}>
          {estimate && !estimate.success ? (
            <>
              {estimate.message}{" "}
              {"unavailableUnitIds" in estimate && estimate.unavailableUnitIds && (
                <button
                  type="button"
                  className="font-medium underline underline-offset-2"
                  onClick={() =>
                    onUnitIdsChange(
                      unitIds.filter((id) => !estimate.unavailableUnitIds?.includes(id)),
                    )
                  }
                >
                  Remove them
                </button>
              )}
            </>
          ) : propertyId && unitIds.length ? (
            "Calculating…"
          ) : (
            "Select a property and unit to see the total."
          )}
        </p>
      )}
      {droppedPicks > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {droppedPicks} earlier {droppedPicks === 1 ? "pick was" : "picks were"} no longer
          available and {droppedPicks === 1 ? "was" : "were"} removed.
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Based on unit and parking prices. Units and parking stay available until the reservation fee
        is paid.
      </p>
    </div>
  );
}
