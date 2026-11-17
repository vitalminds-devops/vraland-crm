import "server-only";
import {
  and,
  asc,
  count,
  getTableColumns,
  inArray,
  sql,
  desc,
  eq,
  ilike,
  isNotNull,
  ne,
  isNull,
  or,
} from "drizzle-orm";
import { db } from "@/db";
import {
  contactNotes,
  contacts,
  dealContacts,
  deals,
  developments,
  pipelineStages,
  properties,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import { brokerRoleSlugs } from "@/lib/permissions/catalog";
import { eligibleAgent } from "../lib/assignment";
import {
  contactStageName,
  contactStagePosition,
  contactStageProbability,
} from "../lib/contact-stage-sql";
import { dataScopeCondition, scopedAgentCondition } from "@/lib/permissions/scope";
import { grantedPropertyCondition } from "@/lib/permissions/property-access";
import type { MoveStage } from "@/features/deals/lib/stage-move";
import { ensurePipelineStages } from "@/features/deals/lib/ensure-pipeline-stages";

const contactSortKeys = ["contact", "lifecycle", "stage", "createdAt"] as const;

export type ContactSortKey = (typeof contactSortKeys)[number];

export function isContactSortKey(value: string | undefined): value is ContactSortKey {
  return !!value && (contactSortKeys as readonly string[]).includes(value);
}

export async function listContacts(input: {
  page: number;
  search?: string;
  lifecycle?: string;
  employment?: string;
  sort?: string;
  dir?: string;
  pageSize?: number;
  broker?: string;
}) {
  const context = await requirePermission("contacts.view");
  const limit = [10, 25, 50, 100].includes(input.pageSize ?? 0) ? input.pageSize! : 20;
  const offset = (input.page - 1) * limit;
  const scope = dataScopeCondition(context, {
    organizationId: contacts.organizationId,
    ownerUserId: contacts.assignedUserId,
    brokerUserId: contacts.brokerUserId,
  });
  const brokerUser = alias(users, "broker_user");
  const search = input.search
    ? or(
        ilike(contacts.firstName, `%${input.search}%`),
        ilike(contacts.lastName, `%${input.search}%`),
        ilike(contacts.email, `%${input.search}%`),
        ilike(contacts.contactCode, `%${input.search}%`),
        ilike(contacts.mobilePhone1, `%${input.search}%`),
        ilike(contacts.mobilePhone2, `%${input.search}%`),
        ilike(contacts.mobilePhone3, `%${input.search}%`),
        ilike(contacts.whatsappNumber, `%${input.search}%`),
        ilike(contacts.viberNumber, `%${input.search}%`),
        ilike(contacts.instagramHandle, `%${input.search}%`),
        ilike(contacts.facebookHandle, `%${input.search}%`),
      )
    : undefined;
  const where = and(
    eq(contacts.organizationId, context.organizationId),
    isNull(contacts.deletedAt),
    input.lifecycle === "unspecified"
      ? isNull(contacts.lifecycleStage)
      : input.lifecycle
        ? eq(contacts.lifecycleStage, input.lifecycle)
        : undefined,
    input.employment ? eq(contacts.employmentType, input.employment) : undefined,
    input.broker ? eq(contacts.brokerUserId, input.broker) : undefined,
    search,
    scope,
  );
  const direction = input.dir === "asc" ? asc : desc;
  const sortColumn =
    input.sort === "contact"
      ? contacts.firstName
      : input.sort === "lifecycle"
        ? contacts.lifecycleStage
        : input.sort === "stage"
          ? contactStagePosition
          : contacts.createdAt;
  const orderBy =
    input.sort && isContactSortKey(input.sort)
      ? [direction(sortColumn), desc(contacts.createdAt), desc(contacts.id)]
      : [desc(contacts.createdAt), desc(contacts.id)];
  const [rows, total] = await Promise.all([
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        middleName: contacts.middleName,
        lastName: contacts.lastName,
        email: contacts.email,
        mobilePhone1: contacts.mobilePhone1,
        mobilePhone2: contacts.mobilePhone2,
        mobilePhone3: contacts.mobilePhone3,
        whatsappNumber: contacts.whatsappNumber,
        viberNumber: contacts.viberNumber,
        instagramHandle: contacts.instagramHandle,
        facebookHandle: contacts.facebookHandle,
        preferredContactMethods: contacts.preferredContactMethods,
        employmentType: contacts.employmentType,
        lifecycleStage: contacts.lifecycleStage,
        pipelineStage: contactStageName,
        stageProbability: contactStageProbability,
        assignedFirstName: users.firstName,
        assignedLastName: users.lastName,
        brokerUserId: contacts.brokerUserId,
        brokerFirstName: brokerUser.firstName,
        brokerLastName: brokerUser.lastName,
        approvalStatus: contacts.approvalStatus,
        contactCode: contacts.contactCode,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .leftJoin(users, eq(contacts.assignedUserId, users.id))
      .leftJoin(
        brokerUser,
        // An agent with no broker is stored as their own broker; show that as no broker.
        and(
          eq(contacts.brokerUserId, brokerUser.id),
          ne(contacts.brokerUserId, contacts.assignedUserId),
        ),
      )
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(contacts).where(where),
  ]);
  return {
    rows,
    total: total[0]?.value ?? 0,
    page: input.page,
    pages: Math.max(1, Math.ceil((total[0]?.value ?? 0) / limit)),
  };
}

export async function listArchivedContacts(input: {
  page: number;
  search?: string;
  pageSize?: number;
}) {
  const context = await requirePermission("contacts.delete");
  const limit = [10, 25, 50, 100].includes(input.pageSize ?? 0) ? input.pageSize! : 20;
  const offset = (input.page - 1) * limit;
  const scope = dataScopeCondition(context, {
    organizationId: contacts.organizationId,
    ownerUserId: contacts.assignedUserId,
    brokerUserId: contacts.brokerUserId,
  });
  const search = input.search
    ? or(
        ilike(contacts.firstName, `%${input.search}%`),
        ilike(contacts.lastName, `%${input.search}%`),
        ilike(contacts.email, `%${input.search}%`),
        ilike(contacts.contactCode, `%${input.search}%`),
        ilike(contacts.mobilePhone1, `%${input.search}%`),
        ilike(contacts.mobilePhone2, `%${input.search}%`),
        ilike(contacts.mobilePhone3, `%${input.search}%`),
        ilike(contacts.whatsappNumber, `%${input.search}%`),
        ilike(contacts.viberNumber, `%${input.search}%`),
        ilike(contacts.instagramHandle, `%${input.search}%`),
        ilike(contacts.facebookHandle, `%${input.search}%`),
      )
    : undefined;
  const where = and(
    eq(contacts.organizationId, context.organizationId),
    isNotNull(contacts.deletedAt),
    search,
    scope,
  );
  const [rows, total] = await Promise.all([
    db
      .select({
        id: contacts.id,
        contactCode: contacts.contactCode,
        firstName: contacts.firstName,
        middleName: contacts.middleName,
        lastName: contacts.lastName,
        email: contacts.email,
        mobilePhone1: contacts.mobilePhone1,
        mobilePhone2: contacts.mobilePhone2,
        mobilePhone3: contacts.mobilePhone3,
        whatsappNumber: contacts.whatsappNumber,
        viberNumber: contacts.viberNumber,
        instagramHandle: contacts.instagramHandle,
        facebookHandle: contacts.facebookHandle,
        lifecycleStage: contacts.lifecycleStage,
        deletedAt: contacts.deletedAt,
        expiredAt: contacts.expiredAt,
        assignedFirstName: users.firstName,
        assignedLastName: users.lastName,
      })
      .from(contacts)
      .leftJoin(users, eq(contacts.assignedUserId, users.id))
      .where(where)
      .orderBy(desc(contacts.deletedAt), desc(contacts.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(contacts).where(where),
  ]);
  return {
    rows,
    total: total[0]?.value ?? 0,
    page: input.page,
    pages: Math.max(1, Math.ceil((total[0]?.value ?? 0) / limit)),
  };
}

function contactAssigneeCondition(context: Awaited<ReturnType<typeof requirePermission>>) {
  return and(eligibleAgent(context.organizationId), scopedAgentCondition(context))!;
}

/** Agents who can take over a restored contact; empty when the caller can't reassign. */
export async function listRestoreAgents() {
  const context = await requirePermission("contacts.delete");
  if (!context.permissions.has("contacts.reassign_broker")) return [];
  return db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(contactAssigneeCondition(context))
    .orderBy(asc(users.firstName))
    .limit(500);
}

export async function getContactOptions() {
  const context = await requirePermission("contacts.view");
  await ensurePipelineStages(context.organizationId);
  const canCreateDeal = context.permissions.has("deals.create");
  const brokerUser = alias(users, "broker_user");
  const [assignees, dealStages, developmentOptions, propertyOptions] =
    await Promise.all([
      db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          brokerId: users.brokerId,
          brokerFirstName: brokerUser.firstName,
          brokerLastName: brokerUser.lastName,
        })
        .from(users)
        .leftJoin(brokerUser, eq(users.brokerId, brokerUser.id))
        .where(contactAssigneeCondition(context))
        .orderBy(asc(users.firstName)),
      canCreateDeal
        ? db
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
            .orderBy(asc(pipelineStages.position))
        : Promise.resolve([] as MoveStage[]),
      db
        .select({ id: developments.id, name: developments.name })
        .from(developments)
        .where(
          and(
            eq(developments.organizationId, context.organizationId),
            inArray(developments.status, ["active", "pre_selling"]),
          ),
        )
        .orderBy(asc(developments.name))
        .limit(500),
      // Properties for the deal section
      db
        .select({ id: properties.id, title: properties.title })
        .from(properties)
        .where(
          and(
            eq(properties.organizationId, context.organizationId),
            isNull(properties.deletedAt),
            grantedPropertyCondition(context, { propertyId: properties.id }),
          ),
        )
        .orderBy(asc(properties.title))
        .limit(500),
    ]);
  return {
    assignees,
    dealStages,
    developments: developmentOptions,
    properties: propertyOptions,
    canCreateDeal,
  };
}

export async function getBrokers() {
  const context = await requirePermission("contacts.view");
  const brokers = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .innerJoin(userRoles, eq(users.id, userRoles.userId))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(users.organizationId, context.organizationId),
        eq(users.status, "active"),
        isNull(users.deletedAt),
        inArray(sql`lower(${roles.slug})`, [...brokerRoleSlugs]),
      ),
    )
    .orderBy(asc(users.firstName));
  return brokers;
}

export async function getContact(id: string) {
  const context = await requirePermission("contacts.view");
  if (!(await canAccessResource(context, { type: "contact", id }))) return null;
  const [record] = await db
    .select({
      ...getTableColumns(contacts),
      assignedFirstName: users.firstName,
      assignedLastName: users.lastName,
      preferredDevelopmentName: developments.name,
    })
    .from(contacts)
    .leftJoin(users, eq(contacts.assignedUserId, users.id))
    .leftJoin(developments, eq(contacts.preferredDevelopmentId, developments.id))
    .where(
      and(
        eq(contacts.id, id),
        eq(contacts.organizationId, context.organizationId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!record) return null;
  const notes = await db
    .select({
      id: contactNotes.id,
      note: contactNotes.note,
      isPinned: contactNotes.isPinned,
      createdAt: contactNotes.createdAt,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
    })
    .from(contactNotes)
    .leftJoin(users, eq(contactNotes.authorUserId, users.id))
    .where(eq(contactNotes.contactId, id))
    .orderBy(desc(contactNotes.isPinned), desc(contactNotes.createdAt));
  const [deal] = await db
    .select({
      id: deals.id,
      dealType: deals.dealType,
      stageId: deals.stageId,
      stageName: pipelineStages.name,
      amount: deals.amount,
      expectedCommission: deals.expectedCommission,
      expectedCloseDate: deals.expectedCloseDate,
    })
    .from(deals)
    .innerJoin(dealContacts, and(eq(dealContacts.dealId, deals.id), eq(dealContacts.contactId, id)))
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(and(eq(deals.organizationId, context.organizationId), isNull(deals.deletedAt)))
    .orderBy(asc(deals.createdAt))
    .limit(1);
  return { record, notes, deal: deal ?? null };
}

const EXPORT_PAGE = 5000;

export async function exportContacts() {
  const context = await requirePermission("contacts.export");
  const scope = dataScopeCondition(context, {
    organizationId: contacts.organizationId,
    ownerUserId: contacts.assignedUserId,
    brokerUserId: contacts.brokerUserId,
  });
  const brokerUser = alias(users, "broker_user");
  const page = (tx: Pick<typeof db, "select">, offset: number) =>
    tx
      .select({
        code: contacts.contactCode,
        firstName: contacts.firstName,
        middleName: contacts.middleName,
        lastName: contacts.lastName,
        companyName: contacts.companyName,
        email: contacts.email,
        mobilePhone1: contacts.mobilePhone1,
        mobilePhone2: contacts.mobilePhone2,
        mobilePhone3: contacts.mobilePhone3,
        whatsappNumber: contacts.whatsappNumber,
        viberNumber: contacts.viberNumber,
        instagramHandle: contacts.instagramHandle,
        facebookHandle: contacts.facebookHandle,
        preferredContactMethods: contacts.preferredContactMethods,
        lifecycleStage: contacts.lifecycleStage,
        employmentType: contacts.employmentType,
        currentAddressLine1: contacts.currentAddressLine1,
        currentBarangay: contacts.currentBarangay,
        currentCity: contacts.currentCity,
        currentProvince: contacts.currentProvince,
        currentPostalCode: contacts.currentPostalCode,
        currentCountry: contacts.currentCountry,
        purchaseType: contacts.purchaseType,
        financingPreference: contacts.financingPreference,
        financingPreferenceOther: contacts.financingPreferenceOther,
        bankName: contacts.bankName,
        assignedAgentId: contacts.assignedUserId,
        brokerUserId: contacts.brokerUserId,
        brokerFirstName: brokerUser.firstName,
        brokerLastName: brokerUser.lastName,
        notes: contacts.notes,
        annualIncome: contacts.annualIncome,
        budgetMin: contacts.budgetMin,
        budgetMax: contacts.budgetMax,
        preferredDevelopmentId: contacts.preferredDevelopmentId,
        preferredUnitIds: contacts.preferredUnitIds,
        marketingConsent: contacts.marketingConsent,
        approvalStatus: contacts.approvalStatus,
      })
      .from(contacts)
      .leftJoin(
        brokerUser,
        // An agent with no broker is stored as their own broker; show that as no broker.
        and(
          eq(contacts.brokerUserId, brokerUser.id),
          ne(contacts.brokerUserId, contacts.assignedUserId),
        ),
      )
      .where(
        and(eq(contacts.organizationId, context.organizationId), isNull(contacts.deletedAt), scope),
      )
      .orderBy(asc(contacts.lastName), asc(contacts.id))
      .limit(EXPORT_PAGE)
      .offset(offset);
  // Every contact, read in pages from one snapshot so none is skipped or repeated.
  return db.transaction(
    async (tx) => {
      const rows: Awaited<ReturnType<typeof page>> = [];
      for (let offset = 0; ; offset += EXPORT_PAGE) {
        const batch = await page(tx, offset);
        rows.push(...batch);
        if (batch.length < EXPORT_PAGE) return rows;
      }
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
