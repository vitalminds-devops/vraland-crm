type Stage = { id: string; slug: string; isWonStage: boolean };

/**
 * The stages a new payment moves its deal through, in order (deals move one stage at a time):
 * a Reservation takes Opportunity to Reservation, a Monthly takes Reservation to Won, and a
 * Full payment takes Opportunity or Reservation all the way to Won.
 */
export function stagesAfterPayment<S extends Stage>(
  classification: string,
  fromSlug: string,
  stages: readonly S[],
): S[] {
  const reservation = stages.find((s) => s.slug === "reservation");
  const won = stages.find((s) => s.isWonStage);
  const path = (...steps: (S | undefined)[]) =>
    steps.every((step) => step !== undefined) ? (steps as S[]) : [];
  if (classification === "reservation" && fromSlug === "opportunity") return path(reservation);
  if (classification === "monthly" && fromSlug === "reservation") return path(won);
  if (classification === "full_payment" && fromSlug === "opportunity")
    return path(reservation, won);
  if (classification === "full_payment" && fromSlug === "reservation") return path(won);
  return [];
}
