import "server-only";

import { and, asc, count, eq, gte, isNull, lt, lte, sql, sum } from "drizzle-orm";

import { db } from "@/db";
import { bills, deals, payments, pipelineStages, users } from "@/db/schema";
import { manilaDate, startOfManilaMonth } from "@/lib/utils/manila-time";

import type { DashboardScope } from "./dashboard-scope.queries";

type MonthlyAmount = { month: string; value: string };

/** Payments, won and lost opportunities, the pipeline and the forecast. */
export async function salesRows({
  context,
  now,
  monthStart,
  closingWindowEnd,
  monthEndDate,
  dealAccess,
  dealScope,
  monthExpression,
  forecastMonthExpression,
}: DashboardScope) {
  const [
    collectedRows,
    closedSalesRows,
    forecastRows,
    stageRows,
    wonRows,
    lostRows,
    closingSoonRows,
    reservationRows,
    wonTotalRows,
    wonCollectedRows,
    monthlyPaidRows,
  ] = await Promise.all([
    db
      .select({ count: count(), value: sum(payments.amount) })
      .from(payments)
      .innerJoin(bills, eq(bills.id, payments.billId))
      .innerJoin(deals, eq(deals.id, bills.dealId))
      .where(
        and(
          eq(payments.organizationId, context.organizationId),
          isNull(payments.deletedAt),
          gte(payments.paidOn, manilaDate(monthStart)),
          lte(payments.paidOn, monthEndDate),
          isNull(deals.deletedAt),
          dealScope,
        ),
      ),
    db
      .select({ month: monthExpression, value: sum(deals.amount) })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "won"),
          gte(deals.actualCloseDate, manilaDate(startOfManilaMonth(now, -5))),
          isNull(deals.deletedAt),
          dealScope,
        ),
      )
      .groupBy(monthExpression)
      .orderBy(asc(monthExpression)) as Promise<MonthlyAmount[]>,
    db
      .select({
        month: forecastMonthExpression,
        value: sql<string>`coalesce(sum(${deals.amount} * (${deals.probability} / 100.0)), 0)`,
      })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "open"),
          gte(deals.expectedCloseDate, manilaDate(monthStart)),
          lt(deals.expectedCloseDate, manilaDate(startOfManilaMonth(now, 6))),
          isNull(deals.deletedAt),
          dealScope,
        ),
      )
      .groupBy(forecastMonthExpression)
      .orderBy(asc(forecastMonthExpression)) as Promise<MonthlyAmount[]>,
    db
      .select({ name: pipelineStages.name, value: count(deals.id) })
      .from(pipelineStages)
      .leftJoin(
        deals,
        and(
          eq(deals.stageId, pipelineStages.id),
          eq(deals.organizationId, context.organizationId),
          isNull(deals.deletedAt),
          dealScope,
        ),
      )
      .where(
        and(
          eq(pipelineStages.organizationId, context.organizationId),
          eq(pipelineStages.isActive, true),
        ),
      )
      .groupBy(pipelineStages.id)
      .orderBy(asc(pipelineStages.position)),
    db
      .select({ count: count(), value: sum(deals.amount) })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "won"),
          gte(deals.actualCloseDate, manilaDate(monthStart)),
          lte(deals.actualCloseDate, monthEndDate),
          isNull(deals.deletedAt),
          dealAccess,
        ),
      ),
    db
      .select({ value: count() })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "lost"),
          gte(deals.actualCloseDate, manilaDate(monthStart)),
          lte(deals.actualCloseDate, monthEndDate),
          isNull(deals.deletedAt),
          dealAccess,
        ),
      ),
    db
      .select({
        id: deals.id,
        title: deals.title,
        amount: deals.amount,
        expectedCloseDate: deals.expectedCloseDate,
        probability: deals.probability,
        stageName: pipelineStages.name,
        agentFirstName: users.firstName,
        agentLastName: users.lastName,
      })
      .from(deals)
      .leftJoin(pipelineStages, eq(pipelineStages.id, deals.stageId))
      .leftJoin(users, eq(users.id, deals.agentUserId))
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "open"),
          isNull(deals.deletedAt),
          gte(deals.expectedCloseDate, manilaDate(now)),
          lte(deals.expectedCloseDate, manilaDate(closingWindowEnd)),
          dealScope,
        ),
      )
      .orderBy(asc(deals.expectedCloseDate))
      .limit(6),
    // Reservation payments received this month.
    db
      .select({ count: count(), value: sum(payments.amount) })
      .from(payments)
      .innerJoin(bills, eq(bills.id, payments.billId))
      .innerJoin(deals, eq(deals.id, bills.dealId))
      .where(
        and(
          eq(payments.organizationId, context.organizationId),
          isNull(payments.deletedAt),
          eq(payments.classification, "reservation"),
          gte(payments.paidOn, manilaDate(monthStart)),
          lte(payments.paidOn, monthEndDate),
          isNull(deals.deletedAt),
          dealScope,
        ),
      ),
    // Every won opportunity, all time.
    db
      .select({ count: count(), value: sum(deals.amount) })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          eq(deals.status, "won"),
          isNull(deals.deletedAt),
          dealScope,
        ),
      ),
    // What has been collected on those won opportunities.
    db
      .select({ value: sum(payments.amount) })
      .from(payments)
      .innerJoin(bills, eq(bills.id, payments.billId))
      .innerJoin(deals, eq(deals.id, bills.dealId))
      .where(
        and(
          eq(payments.organizationId, context.organizationId),
          isNull(payments.deletedAt),
          eq(deals.status, "won"),
          isNull(deals.deletedAt),
          dealScope,
        ),
      ),
    // Monthly amortization payments received, all time.
    db
      .select({ count: count(), value: sum(payments.amount) })
      .from(payments)
      .innerJoin(bills, eq(bills.id, payments.billId))
      .innerJoin(deals, eq(deals.id, bills.dealId))
      .where(
        and(
          eq(payments.organizationId, context.organizationId),
          isNull(payments.deletedAt),
          eq(payments.classification, "monthly"),
          isNull(deals.deletedAt),
          dealScope,
        ),
      ),
  ]);
  return {
    collectedRows,
    closedSalesRows,
    forecastRows,
    stageRows,
    wonRows,
    lostRows,
    closingSoonRows,
    reservationRows,
    wonTotalRows,
    wonCollectedRows,
    monthlyPaidRows,
  };
}
