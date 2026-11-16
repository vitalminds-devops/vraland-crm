import "../../config/load-environment";
import { and, eq, isNull, not, or } from "drizzle-orm";
import { closeDatabaseConnection, db } from "../client";
import { deals, organizations, pipelineStages } from "../schema";
import { dealFirstMonthPaid, dealReservationPaid } from "@/features/billing/lib/deal-payment";

// Read-only. Deals that reached Reservation or Won before payments had to cover the fee and the first
// monthly amortization (or before multi-unit fees were summed) may sit past what they have paid.
try {
  const rows = await db
    .select({
      organization: organizations.name,
      dealCode: deals.dealCode,
      title: deals.title,
      stage: pipelineStages.name,
    })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .innerJoin(organizations, eq(deals.organizationId, organizations.id))
    .where(
      and(
        isNull(deals.deletedAt),
        or(
          and(eq(pipelineStages.slug, "reservation"), not(dealReservationPaid)),
          and(eq(pipelineStages.isWonStage, true), not(dealFirstMonthPaid)),
        ),
      ),
    )
    .orderBy(organizations.name, deals.dealCode);

  for (const row of rows)
    console.info(`  ${row.organization}  ${row.dealCode}  ${row.title}  (${row.stage})`);
  console.info(
    rows.length
      ? `\n${rows.length} deal(s) are past what their payments cover. Record the missing payments, or move them back.`
      : "Every deal in Reservation or Won is covered by its payments.",
  );
} finally {
  await closeDatabaseConnection();
}
