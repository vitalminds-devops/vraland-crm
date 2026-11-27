import "server-only";

import { format, parseISO } from "date-fns";

import { requirePermission } from "@/lib/permissions/authorization";
import { resolveDataScope } from "@/lib/permissions/policy";
import { rankPriorities, revenueSeries } from "../lib/dashboard-shaping";
import { manilaDate } from "@/lib/utils/manila-time";
import { dashboardSections } from "@/lib/permissions/view-access";
import { formatMoneyShort } from "@/lib/utils/money";
import { percentageChange, rate } from "../lib/metrics";
import { ensurePipelineStages } from "@/features/deals/lib/ensure-pipeline-stages";
import { dashboardScope } from "./dashboard-scope.queries";
import { peopleRows } from "./dashboard-people.queries";
import { salesRows } from "./dashboard-sales.queries";
import { workRows } from "./dashboard-work.queries";
import { inventoryRows } from "./dashboard-inventory.queries";

export type DashboardReading = {
  key: string;
  label: string;
  value: string;
  hint: string;
  tone?: "attention";
};

export async function getDashboardData() {
  const context = await requirePermission("dashboard.view");
  await ensurePipelineStages(context.organizationId);
  const scope = dashboardScope(context);
  const {
    now,
    monthStart,
    organizationWide,
    canViewDeals,
    canViewContacts,
    canViewProperties,
    canViewTasks,
    canViewCalendar,
  } = scope;
  const [people, sales, work, inventory] = await Promise.all([
    peopleRows(scope),
    salesRows(scope),
    workRows(scope),
    inventoryRows(scope),
  ]);
  const {
    organizationRows,
    activeLeadRows,
    newLeadRows,
    previousLeadRows,
    propertyRows,
    collectedRows,
    closedSalesRows,
    forecastRows,
    stageRows,
    taskRows,
    viewingRows,
    activityRows,
    overdueTaskRows,
    upcomingViewingRows,
    wonRows,
    lostRows,
    reservedPropertyRows,
    closingSoonRows,
    taskLoadRows,
    completedTaskRows,
    inventoryStatusRows,
    reservationRows,
    floorRows,
    wonTotalRows,
    wonCollectedRows,
    monthlyPaidRows,
    unitAvailabilityRows,
    parkingAvailabilityRows,
  } = { ...people, ...sales, ...work, ...inventory };

  const sections = dashboardSections((key) => context.permissions.has(key));

  const priorities = rankPriorities(
    [
      ...(canViewTasks ? taskRows.map((item) => ({ ...item, source: "task" as const })) : []),
      ...(canViewCalendar
        ? viewingRows.map((item) => ({ ...item, source: "viewing" as const }))
        : []),
    ],
    now,
  );

  const currency = organizationRows[0]?.currency ?? "PHP";
  const overdueTasks = overdueTaskRows[0]?.value ?? 0;
  const wonCount = wonRows[0]?.count ?? 0;
  const wonValue = Number(wonRows[0]?.value ?? 0);
  const lostCount = lostRows[0]?.value ?? 0;
  const closedCount = wonCount + lostCount;
  const winRate = rate(wonCount, closedCount);
  const newLeads = newLeadRows[0]?.value ?? 0;

  // A reading another panel already shows is left out while that panel is on screen.
  const readings = [
    canViewTasks &&
      !sections.taskLoad && {
        key: "overdueTasks",
        label: "Overdue tasks",
        value: overdueTasks.toLocaleString(),
        hint: "Open and past due",
        tone: overdueTasks > 0 ? ("attention" as const) : undefined,
      },
    canViewCalendar &&
      !sections.viewings && {
        key: "viewings",
        label: "Viewings scheduled",
        value: (upcomingViewingRows[0]?.value ?? 0).toLocaleString(),
        hint: "Next 7 days",
      },
    canViewContacts && {
      key: "activeContacts",
      label: "Active contacts",
      value: (activeLeadRows[0]?.value ?? 0).toLocaleString(),
      hint: "Not yet converted",
    },
    canViewContacts && {
      key: "newLeads",
      label: "New contacts this month",
      value: newLeads.toLocaleString(),
      hint: `Created since ${format(parseISO(manilaDate(monthStart)), "MMM d")}`,
    },
    canViewDeals && {
      key: "closed",
      label: "Won this month",
      value: formatMoneyShort(wonValue, currency) ?? "",
      hint: `${wonCount} won · ${lostCount} lost`,
    },
    canViewDeals && {
      key: "winRate",
      label: "Win rate this month",
      value: winRate === null ? "—" : `${winRate}%`,
      hint:
        closedCount === 0
          ? "None closed yet"
          : `Of ${closedCount} closed ${closedCount === 1 ? "opportunity" : "opportunities"}`,
    },
    canViewProperties &&
      !sections.inventory && {
        key: "inventory",
        label: "Reserved properties",
        value: (reservedPropertyRows[0]?.value ?? 0).toLocaleString(),
        hint: "Reserved or under contract",
      },
  ].filter((reading): reading is DashboardReading => Boolean(reading));

  return {
    currency,
    kpis: {
      activeLeads: activeLeadRows[0]?.value ?? 0,
      leadChange: percentageChange(newLeadRows[0]?.value ?? 0, previousLeadRows[0]?.value ?? 0),
      activeProperties: propertyRows[0]?.value ?? 0,
      payments: collectedRows[0]?.count ?? 0,
      collected: Number(collectedRows[0]?.value ?? 0),
      reservationPayments: reservationRows[0]?.count ?? 0,
      reservationsReceived: Number(reservationRows[0]?.value ?? 0),
      availableUnits: unitAvailabilityRows[0]?.available ?? 0,
      totalUnits: unitAvailabilityRows[0]?.total ?? 0,
      availableParking: parkingAvailabilityRows[0]?.available ?? 0,
      totalParking: parkingAvailabilityRows[0]?.total ?? 0,
      floors: floorRows[0]?.floors ?? 0,
      floorProperties: floorRows[0]?.properties ?? 0,
      wonCount: wonTotalRows[0]?.count ?? 0,
      wonValue: Number(wonTotalRows[0]?.value ?? 0),
      // Billing data: never sent without the payment figures.
      wonCollected: sections.kpis.collected ? Number(wonCollectedRows[0]?.value ?? 0) : 0,
      monthlyPayments: monthlyPaidRows[0]?.count ?? 0,
      monthlyPaid: Number(monthlyPaidRows[0]?.value ?? 0),
    },
    revenueSeries: revenueSeries(closedSalesRows, forecastRows, now),
    pipelineStages: stageRows
      .filter((row) => row.value > 0)
      .map((row) => ({ name: row.name, value: row.value })),
    priorities,
    closingSoon: closingSoonRows.map((row) => ({
      id: row.id,
      title: row.title,
      amount: Number(row.amount ?? 0),
      expectedCloseDate: row.expectedCloseDate,
      probability: Number(row.probability ?? 0),
      stageName: row.stageName,
      agentName: [row.agentFirstName, row.agentLastName].filter(Boolean).join(" ") || null,
    })),
    taskLoad: {
      overdue: taskLoadRows[0]?.overdue ?? 0,
      dueToday: taskLoadRows[0]?.dueToday ?? 0,
      thisWeek: taskLoadRows[0]?.thisWeek ?? 0,
      unscheduled: taskLoadRows[0]?.unscheduled ?? 0,
      completedThisWeek: completedTaskRows[0]?.value ?? 0,
    },
    inventoryStatus: inventoryStatusRows.map((row) => ({
      status: row.status,
      value: Number(row.value),
    })),
    readings: sections.summary ? readings : [],
    activities: activityRows,
    sections,
    organizationWide,
    scope: resolveDataScope(context),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
