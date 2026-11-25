import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type AnyColumn,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  activities,
  contacts,
  dealAgents,
  dealCommissions,
  dealContacts,
  deals,
  dealStageChangeRequests,
  dealStageHistory,
  developments,
  floors,
  lostReasons,
  offers,
  pipelineStages,
  properties,
  tasks,
  propertyParkingSlots,
  units,
  users,
} from "@/db/schema";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import { eligibleAgent } from "@/features/contacts/lib/assignment";
import { grantedPropertyCondition } from "@/lib/permissions/property-access";
import { dataScopeCondition, scopedAgentCondition } from "@/lib/permissions/scope";
import { canManageBilling } from "@/lib/permissions/policy";
import { resolveMoveRole } from "../lib/stage-transitions";
import { dealFirstMonthPaid, dealReservationPaid } from "@/features/billing/lib/deal-payment";
import { leadNotArchived } from "../lib/lead-not-archived";
import { isContactsFirstDeal } from "../lib/first-deal";
import { ensurePipelineStages } from "../lib/ensure-pipeline-stages";
import { BOARD_COLUMN_LIMIT } from "../lib/board-limit";

const scope = (context: Awaited<ReturnType<typeof requirePermission>>) =>
  and(
    dataScopeCondition(context, {
      organizationId: deals.organizationId,
      ownerUserId: deals.primaryAgentUserId,
      brokerUserId: deals.brokerUserId,
    }),
    leadNotArchived,
  )!;
const fromStage = alias(pipelineStages, "from_stage");
const toStage = alias(pipelineStages, "to_stage");
const brokerUser = alias(users, "broker_user");
const leadCreator = alias(users, "lead_creator");
/** A user's role names, so a card can say who someone is rather than a fixed title. */
const roleNamesOf = (userId: AnyColumn) =>
  sql<string | null>`(select string_agg(r.name, ', ' order by r.name)
    from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = ${userId})`;

export async function getPipelineBoard() {
  const context = await requirePermission("deals.view");
  await ensurePipelineStages(context.organizationId);
  // The newest cards of each stage, so one crowded stage can't make the board load everything.
  const ranked = db
    .select({
      id: deals.id,
      rank: sql<number>`row_number() over (partition by ${deals.stageId} order by ${deals.updatedAt} desc)`.as(
        "rank",
      ),
    })
    .from(deals)
    .where(
      and(
        eq(deals.organizationId, context.organizationId),
        isNull(deals.deletedAt),
        scope(context),
        // Closed deals drop off the board 90 days after their last change.
        or(eq(deals.status, "open"), sql`${deals.updatedAt} > now() - interval '90 days'`),
      ),
    )
    .as("ranked");
  const [stages, rows] = await Promise.all([
    db
      .select({
        id: pipelineStages.id,
        name: pipelineStages.name,
        slug: pipelineStages.slug,
        position: pipelineStages.position,
        isWonStage: pipelineStages.isWonStage,
        isLostStage: pipelineStages.isLostStage,
        isCancelledStage: pipelineStages.isCancelledStage,
        requiresApproval: pipelineStages.requiresApproval,
      })
      .from(pipelineStages)
      .where(
        and(
          eq(pipelineStages.organizationId, context.organizationId),
          eq(pipelineStages.isActive, true),
        ),
      )
      .orderBy(asc(pipelineStages.position)),
    db
      .select({
        id: deals.id,
        code: deals.dealCode,
        title: deals.title,
        stageId: deals.stageId,
        stageSlug: pipelineStages.slug,
        amount: deals.amount,
        currency: deals.currency,
        probability: deals.probability,
        expectedCloseDate: deals.expectedCloseDate,
        updatedAt: deals.updatedAt,
        propertyTitle: properties.title,
        developmentName: developments.name,
        floorLabel: floors.label,
        unitCode: units.code,
        /** The deal's units; a lead's first deal without its own falls back to the units the lead picked. */
        unitCodes: sql<
          string | null
        >`(select string_agg(u.code, ', ' order by u.code) from ${units} u
          where u.id = ${deals.unitId} or u.id = any(${deals.unitIds})
            or (cardinality(${deals.unitIds}) = 0 and ${isContactsFirstDeal}
              and u.id = any(${contacts.preferredUnitIds})))`,
        /** The deal's parking slot identifiers, such as "P1, P12". */
        parkingCodes: sql<
          string | null
        >`(select string_agg(s.code, ', ' order by s.code) from ${propertyParkingSlots} s
          where s.id = any(${deals.parkingSlotIds}))`,
        agentFirstName: users.firstName,
        agentLastName: users.lastName,
        brokerFirstName: brokerUser.firstName,
        brokerLastName: brokerUser.lastName,
        agentRoleNames: roleNamesOf(users.id),
        brokerRoleNames: roleNamesOf(brokerUser.id),
        agentIsBroker: sql<boolean>`coalesce(${deals.brokerUserId} = ${deals.primaryAgentUserId}, false)`,
        creatorFirstName: leadCreator.firstName,
        creatorLastName: leadCreator.lastName,
        creatorRoleNames: roleNamesOf(leadCreator.id),
        contactFirstName: contacts.firstName,
        contactMiddleName: contacts.middleName,
        contactLastName: contacts.lastName,
        nextAction: sql<
          string | null
        >`(select min(${tasks.dueAt})::text from ${tasks} where ${tasks.dealId} = ${deals.id} and ${tasks.status} in ('todo','in_progress') and ${tasks.deletedAt} is null)`,
        financingType: deals.financingType,
        reservationPaid: dealReservationPaid,
        firstMonthPaid: dealFirstMonthPaid,
        // Most recent stage history note
        lastStageNote: sql<string | null>`latest_stage.note`,
        pendingApprovalStage: sql<string | null>`(
          SELECT ps.name
          FROM deal_stage_change_requests r
          JOIN pipeline_stages ps ON ps.id = r.to_stage_id
          WHERE r.deal_id = deals.id AND r.status = 'pending'
          LIMIT 1
        )`,
        lastStageChangedAt: sql<string | null>`latest_stage.changed_at::text`,
        // Cancellation reason if deal is cancelled
        cancellationReason: deals.cancellationReason,
      })
      .from(deals)
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .leftJoin(properties, eq(deals.propertyId, properties.id))
      .leftJoin(developments, eq(deals.developmentId, developments.id))
      .leftJoin(units, eq(deals.unitId, units.id))
      .leftJoin(floors, eq(units.floorId, floors.id))
      .leftJoin(users, eq(deals.primaryAgentUserId, users.id))
      .leftJoin(
        dealContacts,
        and(eq(dealContacts.dealId, deals.id), eq(dealContacts.isPrimary, true)),
      )
      .leftJoin(contacts, eq(dealContacts.contactId, contacts.id))
      .leftJoin(leadCreator, eq(contacts.createdBy, leadCreator.id))
      .leftJoin(brokerUser, eq(deals.brokerUserId, brokerUser.id))
      // One lookup of the latest stage change, shared by the note and the date.
      .leftJoinLateral(
        sql`(select h.note, h.changed_at from deal_stage_history h
          where h.deal_id = ${deals.id} order by h.changed_at desc limit 1) latest_stage`,
        sql`true`,
      )
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          inArray(
            deals.id,
            db.select({ id: ranked.id }).from(ranked).where(lte(ranked.rank, BOARD_COLUMN_LIMIT)),
          ),
        ),
      )
      .orderBy(desc(deals.updatedAt)),
  ]);

  const userRole = resolveMoveRole(context);

  return {
    stages,
    deals: rows,
    canChangeStage: context.permissions.has("deals.change_stage"),
    canApproveStageChange: context.permissions.has("deals.approve_stage_change"),
    canManageBilling: canManageBilling(context),
    canMoveBack: context.permissions.has("deals.move_back"),
    canCreate: context.permissions.has("deals.create"),
    userRole,
  };
}

export async function getPendingStageApprovals() {
  const context = await requirePermission("deals.view");
  if (!context.permissions.has("deals.approve_stage_change")) return [];
  const requester = alias(users, "requester");
  return db
    .select({
      id: dealStageChangeRequests.id,
      dealId: dealStageChangeRequests.dealId,
      dealTitle: deals.title,
      fromStageName: fromStage.name,
      toStageName: toStage.name,
      reason: dealStageChangeRequests.reason,
      createdAt: dealStageChangeRequests.createdAt,
      requesterFirstName: requester.firstName,
      requesterLastName: requester.lastName,
    })
    .from(dealStageChangeRequests)
    .innerJoin(deals, eq(dealStageChangeRequests.dealId, deals.id))
    .innerJoin(toStage, eq(dealStageChangeRequests.toStageId, toStage.id))
    .leftJoin(fromStage, eq(dealStageChangeRequests.fromStageId, fromStage.id))
    .leftJoin(requester, eq(dealStageChangeRequests.requestedBy, requester.id))
    .where(
      and(
        eq(dealStageChangeRequests.organizationId, context.organizationId),
        eq(dealStageChangeRequests.status, "pending"),
        isNull(deals.deletedAt),
        scope(context),
      ),
    )
    .orderBy(desc(dealStageChangeRequests.createdAt))
    .limit(100);
}

export async function listDeals(input: {
  page: number;
  search?: string;
  stage?: string;
  status?: string;
  /** The list shows 20 a page; an export asks for more. */
  pageSize?: number;
}) {
  const context = await requirePermission("deals.view");
  await ensurePipelineStages(context.organizationId);
  const limit = input.pageSize ?? 20;
  const where = and(
    eq(deals.organizationId, context.organizationId),
    isNull(deals.deletedAt),
    input.stage ? eq(deals.stageId, input.stage) : undefined,
    input.status ? eq(deals.status, input.status) : undefined,
    input.search
      ? or(
          ilike(deals.title, `%${input.search}%`),
          ilike(deals.dealCode, `%${input.search}%`),
          ilike(developments.name, `%${input.search}%`),
        )
      : undefined,
    scope(context),
  );
  const [rows, total, stages] = await Promise.all([
    db
      .select({
        id: deals.id,
        code: deals.dealCode,
        title: deals.title,
        status: deals.status,
        dealType: deals.dealType,
        amount: deals.amount,
        currency: deals.currency,
        probability: deals.probability,
        expectedCloseDate: deals.expectedCloseDate,
        stageName: pipelineStages.name,
        propertyTitle: properties.title,
        developmentName: developments.name,
        floorLabel: floors.label,
        unitCode: units.code,
        agentFirstName: users.firstName,
        agentLastName: users.lastName,
      })
      .from(deals)
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .leftJoin(properties, eq(deals.propertyId, properties.id))
      .leftJoin(developments, eq(deals.developmentId, developments.id))
      .leftJoin(units, eq(deals.unitId, units.id))
      .leftJoin(floors, eq(units.floorId, floors.id))
      .leftJoin(users, eq(deals.primaryAgentUserId, users.id))
      .where(where)
      .orderBy(desc(deals.updatedAt))
      .limit(limit)
      .offset((input.page - 1) * limit),
    db
      .select({ value: count() })
      .from(deals)
      .leftJoin(developments, eq(deals.developmentId, developments.id))
      .where(where),
    db
      .select({
        id: pipelineStages.id,
        name: pipelineStages.name,
        slug: pipelineStages.slug,
        isWonStage: pipelineStages.isWonStage,
        isLostStage: pipelineStages.isLostStage,
        isCancelledStage: pipelineStages.isCancelledStage,
        position: pipelineStages.position,
        requiresApproval: pipelineStages.requiresApproval,
      })
      .from(pipelineStages)
      .where(
        and(
          eq(pipelineStages.organizationId, context.organizationId),
          eq(pipelineStages.isActive, true),
        ),
      )
      .orderBy(asc(pipelineStages.position)),
  ]);
  return {
    rows,
    stages,
    total: total[0]?.value ?? 0,
    pages: Math.max(1, Math.ceil((total[0]?.value ?? 0) / limit)),
  };
}

function dealContactScope(context: Awaited<ReturnType<typeof requirePermission>>) {
  return dataScopeCondition(context, {
    organizationId: contacts.organizationId,
    ownerUserId: contacts.assignedUserId,
    brokerUserId: contacts.brokerUserId,
  });
}

export async function getDealOptions() {
  const context = await requirePermission("deals.view");
  await ensurePipelineStages(context.organizationId);
  const contactScope = dealContactScope(context);
  return {
    stages: await db
      .select({
        id: pipelineStages.id,
        name: pipelineStages.name,
        slug: pipelineStages.slug,
        isWonStage: pipelineStages.isWonStage,
        isLostStage: pipelineStages.isLostStage,
        isCancelledStage: pipelineStages.isCancelledStage,
        position: pipelineStages.position,
        requiresApproval: pipelineStages.requiresApproval,
      })
      .from(pipelineStages)
      .where(
        and(
          eq(pipelineStages.organizationId, context.organizationId),
          eq(pipelineStages.isActive, true),
        ),
      )
      .orderBy(asc(pipelineStages.position)),
    properties: await db
      .select({ id: properties.id, title: properties.title })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          dataScopeCondition(context, {
            organizationId: properties.organizationId,
          }),
          grantedPropertyCondition(context, { propertyId: properties.id }),
        ),
      )
      .orderBy(asc(properties.title))
      .limit(500),
    contacts: await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, context.organizationId),
          isNull(contacts.deletedAt),
          contactScope,
        ),
      )
      .orderBy(asc(contacts.lastName))
      .limit(500),
    agents: await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(and(eligibleAgent(context.organizationId), scopedAgentCondition(context)))
      .orderBy(asc(users.lastName)),
    lostReasons: await db
      .select({ id: lostReasons.id, name: lostReasons.name })
      .from(lostReasons)
      .where(
        and(eq(lostReasons.organizationId, context.organizationId), eq(lostReasons.isActive, true)),
      )
      .orderBy(asc(lostReasons.name)),
  };
}

export async function getDeal(id: string) {
  const context = await requirePermission("deals.view");
  if (!(await canAccessResource(context, { type: "deal", id }))) return null;
  const [record] = await db
    .select({
      deal: deals,
      stageName: pipelineStages.name,
      stageSlug: pipelineStages.slug,
      stageClosed: sql<boolean>`(${pipelineStages.isWonStage} or ${pipelineStages.isLostStage} or ${pipelineStages.isCancelledStage})`,
      developmentName: developments.name,
      propertyTitle: properties.title,
      propertyCode: properties.propertyCode,
      agentFirstName: users.firstName,
      agentLastName: users.lastName,
      brokerFirstName: brokerUser.firstName,
      brokerLastName: brokerUser.lastName,
      lostReasonName: lostReasons.name,
      reservationPaid: dealReservationPaid,
      firstMonthPaid: dealFirstMonthPaid,
    })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .leftJoin(properties, eq(deals.propertyId, properties.id))
    .leftJoin(developments, eq(deals.developmentId, developments.id))
    .leftJoin(users, eq(deals.primaryAgentUserId, users.id))
    .leftJoin(brokerUser, eq(deals.brokerUserId, brokerUser.id))
    .leftJoin(lostReasons, eq(deals.lostReasonId, lostReasons.id))
    .where(eq(deals.id, id))
    .limit(1);
  if (!record) return null;
  const unitIds = record.deal.unitIds.length
    ? record.deal.unitIds
    : record.deal.unitId
      ? [record.deal.unitId]
      : [];
  const [unitRows, parkingRows] = await Promise.all([
    unitIds.length
      ? db
          .select({
            id: units.id,
            code: units.code,
            status: units.status,
            floorLabel: floors.label,
          })
          .from(units)
          .leftJoin(floors, eq(units.floorId, floors.id))
          .where(inArray(units.id, unitIds))
          .orderBy(asc(units.code))
      : [],
    record.deal.parkingSlotIds.length
      ? db
          .select({ id: propertyParkingSlots.id, code: propertyParkingSlots.code })
          .from(propertyParkingSlots)
          .where(inArray(propertyParkingSlots.id, record.deal.parkingSlotIds))
          .orderBy(asc(propertyParkingSlots.code))
      : [],
  ]);
  const [contactRows, agentRows, history, offerRows, taskRows, activityRows, commissionRows] =
    await Promise.all([
      db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          middleName: contacts.middleName,
          lastName: contacts.lastName,
          role: dealContacts.role,
          isPrimary: dealContacts.isPrimary,
        })
        .from(dealContacts)
        .innerJoin(contacts, eq(dealContacts.contactId, contacts.id))
        .where(eq(dealContacts.dealId, id)),
      db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          role: dealAgents.role,
          split: dealAgents.commissionSplitPercent,
        })
        .from(dealAgents)
        .innerJoin(users, eq(dealAgents.userId, users.id))
        .where(eq(dealAgents.dealId, id)),
      db
        .select({
          id: dealStageHistory.id,
          fromName: fromStage.name,
          toName: toStage.name,
          note: dealStageHistory.note,
          changedAt: dealStageHistory.changedAt,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(dealStageHistory)
        .leftJoin(fromStage, eq(fromStage.id, dealStageHistory.fromStageId))
        .innerJoin(toStage, eq(toStage.id, dealStageHistory.toStageId))
        .leftJoin(users, eq(dealStageHistory.changedBy, users.id))
        .where(eq(dealStageHistory.dealId, id))
        .orderBy(desc(dealStageHistory.changedAt)),
      db
        .select({
          id: offers.id,
          amount: offers.amount,
          currency: offers.currency,
          status: offers.status,
          submittedAt: offers.submittedAt,
          expiresAt: offers.expiresAt,
          terms: offers.terms,
          createdAt: offers.createdAt,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
        })
        .from(offers)
        .leftJoin(contacts, eq(offers.contactId, contacts.id))
        .where(eq(offers.dealId, id))
        .orderBy(desc(offers.createdAt)),
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.dealId, id), isNull(tasks.deletedAt)))
        .orderBy(asc(tasks.dueAt))
        .limit(20),
      db
        .select()
        .from(activities)
        .where(eq(activities.dealId, id))
        .orderBy(desc(activities.createdAt))
        .limit(30),
      db
        .select({
          id: dealCommissions.id,
          firstName: users.firstName,
          lastName: users.lastName,
          roleName: dealCommissions.roleName,
          rate: dealCommissions.rate,
          amount: dealCommissions.amount,
        })
        .from(dealCommissions)
        .innerJoin(users, eq(dealCommissions.userId, users.id))
        .where(eq(dealCommissions.dealId, id))
        .orderBy(desc(dealCommissions.amount)),
    ]);
  return {
    ...record,
    contacts: contactRows,
    agents: agentRows,
    history,
    offers: offerRows,
    tasks: taskRows,
    activities: activityRows,
    commissions: commissionRows,
    units: unitRows,
    parking: parkingRows,
    canCreate: context.permissions.has("deals.create"),
    canUpdate: context.permissions.has("deals.update"),
    canDelete: context.permissions.has("deals.delete"),
    canChangeStage: context.permissions.has("deals.change_stage"),
    canApproveStageChange: context.permissions.has("deals.approve_stage_change"),
    canMoveBack: context.permissions.has("deals.move_back"),
    canReassignAgent: context.permissions.has("deals.reassign_agent"),
    userRole: resolveMoveRole(context),
  };
}

export async function getLostAnalysis() {
  const context = await requirePermission("deals.view");
  const where = and(
    eq(deals.organizationId, context.organizationId),
    eq(deals.status, "lost"),
    isNull(deals.deletedAt),
    scope(context),
  );
  const [summary, reasons, agents, monthly] = await Promise.all([
    db
      .select({
        count: count(),
        value: sql<string>`coalesce(sum(${deals.amount}),0)`,
      })
      .from(deals)
      .where(where),
    db
      .select({
        name: lostReasons.name,
        count: count(),
        value: sql<string>`coalesce(sum(${deals.amount}),0)`,
      })
      .from(deals)
      .leftJoin(lostReasons, eq(deals.lostReasonId, lostReasons.id))
      .where(where)
      .groupBy(lostReasons.name)
      .orderBy(desc(count())),
    db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        count: count(),
        value: sql<string>`coalesce(sum(${deals.amount}),0)`,
      })
      .from(deals)
      .leftJoin(users, eq(deals.primaryAgentUserId, users.id))
      .where(where)
      .groupBy(users.id)
      .orderBy(desc(count())),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${deals.actualCloseDate}), 'YYYY-MM')`,
        count: count(),
        value: sql<string>`coalesce(sum(${deals.amount}),0)`,
      })
      .from(deals)
      .where(where)
      .groupBy(sql`date_trunc('month', ${deals.actualCloseDate})`)
      .orderBy(sql`date_trunc('month', ${deals.actualCloseDate})`),
  ]);
  return {
    summary: summary[0] ?? { count: 0, value: "0" },
    reasons,
    agents,
    monthly,
  };
}
