import "server-only";

import type { db } from "@/db";
import { isFullyPaid, readDealPayments } from "@/features/billing/lib/billing-inventory";
import { heldElsewhere, heldElsewhereMessage } from "./deal-inventory";
import { missingOpportunityDetails } from "./opportunity-requirements";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type GuardStage = { slug: string; isLostStage: boolean; isCancelledStage: boolean };

/**
 * Why the opportunity can't make this move for what it holds or has paid, or null when it can.
 * Runs while the opportunity row is locked.
 */
export async function inventoryOrPaymentRefusal(
  tx: DbTransaction,
  deal: { id: string; unitIds: readonly string[]; parkingSlotIds: readonly string[] },
  from: GuardStage,
  to: GuardStage,
): Promise<string | null> {
  if ((from.slug === "leads" || from.isLostStage) && to.slug === "opportunity") {
    const missing = await missingOpportunityDetails(tx, deal.id);
    // Lost while still a lead, it never had its Opportunity details: go through Leads.
    if (missing)
      return from.isLostStage
        ? "This was lost while still a lead. Reopen it to Leads, then use Move to Opportunity."
        : missing;
    // Units and parking stay open to others until Reservation, but one another opportunity
    // has reserved since (say, while this move waited for approval) can't be this one's too.
    const taken = await heldElsewhere(tx, deal);
    if (taken.length)
      return `${heldElsewhereMessage(taken)} ${
        from.isLostStage
          ? "Reopen it to Leads and pick again."
          : "Pick again with Move to Opportunity."
      }`;
  }
  // Back in Leads an opportunity lets go of its units, so it can't while money is recorded on
  // them: the units would stay held by an opportunity that no longer lists them.
  if (
    to.slug === "leads" &&
    from.slug !== "leads" &&
    (await readDealPayments(tx, deal.id)).paid > 0
  )
    return "This opportunity has payments. Remove its payments in Billing before moving it back to Leads.";
  // shortcut: no refund record. Closing would put paid-for units back on sale while the money
  // is still recorded, so any payment has to be removed first; add refunds before allowing this.
  if (to.isLostStage || to.isCancelledStage) {
    const payments = await readDealPayments(tx, deal.id);
    if (payments.paid > 0)
      return isFullyPaid(payments)
        ? "This opportunity is fully paid. To close it, move it back to Opportunity, remove its payments in Billing, then close it."
        : "This opportunity has payments. Remove its payments in Billing before closing it.";
  }
  return null;
}
