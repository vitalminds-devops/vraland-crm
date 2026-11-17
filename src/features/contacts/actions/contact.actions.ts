"use server";

import { randomUUID } from "node:crypto";
import { eligibleAgent } from "../lib/assignment";
import {
  defaultAdminApprovalStatus,
  defaultRequirementStatus,
  requiredDocumentTypes,
  type ContactApprovalStatus,
} from "../lib/contact-options";
import { parseContactCsvRow } from "../lib/contact-csv";
import {
  findDuplicateInSet,
  normalizeContactEmail,
  normalizeContactMobile,
  type DuplicateCandidate,
  type DuplicateMatch,
  type ImportRowResult,
} from "../lib/contact-duplicates";
import { findDuplicateMatch } from "../lib/contact-duplicate-lookup";
import { parse } from "csv-parse/sync";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  automationEnrollments,
  contactAssignmentHistory,
  contactBrokerHistory,
  contactDocumentRequirements,
  contactNotes,
  contacts,
  dataJobs,
  dealContacts,
  deals,
  developments,
  properties,
  propertyViewings,
  roles,
  tasks,
  units,
  userRoles,
  users,
} from "@/db/schema";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import { brokerRoleSlugs } from "@/lib/permissions/catalog";
import { hasOrganizationWideAccess } from "@/lib/permissions/policy";
import type { AuthorizationContext } from "@/lib/permissions/policy";
import { dataScopeCondition, scopedAgentCondition } from "@/lib/permissions/scope";
import { moveOpenDeals } from "@/features/deals/lib/move-open-deals";
import { enrollByTrigger } from "@/features/marketing/lib/auto-enroll";
import { openDealForApprovedContact } from "@/features/deals/lib/open-deal";
import { buildChangeSet, isEmptyChangeSet } from "@/lib/audit/redact";
import { contactSchema, noteSchema, type ContactInput } from "../schemas/contact.schema";
import { logError } from "@/lib/logger";
import { writeErrorMessage } from "../lib/contact-write-error";
import {
  databaseFailure,
  failure,
  failureFrom,
  notFoundFailure,
  success,
  validationFailure,
  validationFailureFromZod,
  type ActionResult,
} from "@/lib/types/action-result";
import { ActionErrorCode, conflict, permissionDenied } from "@/lib/errors";

export type ContactActionResult = ActionResult<{ id: string }>;

export interface ContactErrorDetails {
  duplicate?: VisibleDuplicateMatch;
  lockedContacts?: string[];
}

/** A duplicate as shown to the caller; `contact` is null when it is outside their access. */
export type VisibleDuplicateMatch = Omit<DuplicateMatch, "contact"> & {
  contact: DuplicateMatch["contact"] | null;
};

async function visibleDuplicate(
  context: AuthorizationContext,
  match: DuplicateMatch,
): Promise<VisibleDuplicateMatch> {
  return (await canAccessResource(context, {
    type: "contact",
    id: match.contact.id,
  }))
    ? match
    : { ...match, contact: null };
}

function describeWriteError(error: unknown): string {
  logError("Contact write failed", error, { operation: "contact_write" });
  const cause = error instanceof Error && error.cause ? error.cause : error;
  const databaseError = cause as {
    code?: string;
    constraint?: string;
    column?: string;
    detail?: string;
    message?: string;
  };
  const specific = writeErrorMessage(databaseError ?? {});
  if (specific) return specific;
  const diagnostic = [
    databaseError?.code && `PostgreSQL ${databaseError.code}`,
    databaseError?.constraint && `constraint: ${databaseError.constraint}`,
    databaseError?.detail || databaseError?.message,
  ]
    .filter(Boolean)
    .join(" — ");
  return process.env.NODE_ENV === "development" && diagnostic
    ? `Contact could not be saved: ${diagnostic}`
    : "Couldn't save contact. Try again.";
}

function contactWriteError(error: unknown): ContactActionResult {
  return databaseFailure(describeWriteError(error));
}

async function validateAssignee(context: AuthorizationContext, userId: string | null) {
  if (!userId) return true;
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eligibleAgent(context.organizationId),
        scopedAgentCondition(context),
      ),
    )
    .limit(1);
  return Boolean(user);
}

/**
 * Ids a contact points at must belong to this organization: an assignable agent, and a
 * preferred development whose units are the chosen ones. Returns the problem, or null.
 */
async function checkContactReferences(
  context: AuthorizationContext,
  value: Pick<
    ContactInput,
    "assignedAgentId" | "preferredDevelopmentId" | "preferredUnitIds"
  >,
): Promise<string | null> {
  if (!(await validateAssignee(context, value.assignedAgentId || null)))
    return "Select an active agent or broker.";
  const developmentId = value.preferredDevelopmentId || null;
  const unitIds = value.preferredUnitIds ?? [];
  if (developmentId) {
    const [development] = await db
      .select({ id: developments.id })
      .from(developments)
      .where(
        and(
          eq(developments.id, developmentId),
          eq(developments.organizationId, context.organizationId),
        ),
      )
      .limit(1);
    if (!development) return "Select a development from your organization.";
  }
  if (unitIds.length) {
    if (!developmentId) return "Select the development of the chosen units.";
    const found = await db
      .select({ id: units.id })
      .from(units)
      .innerJoin(properties, eq(units.buildingId, properties.id))
      .where(
        and(
          inArray(units.id, unitIds),
          eq(properties.organizationId, context.organizationId),
          or(
            eq(units.developmentId, developmentId),
            and(isNull(units.developmentId), eq(properties.developmentId, developmentId)),
          ),
        ),
      );
    if (found.length !== new Set(unitIds).size) return "Select units from the chosen development.";
  }
  return null;
}

function generateContactCode(): string {
  return `VRA-${randomUUID().toUpperCase()}`;
}

function approvalColumnsFor(context: AuthorizationContext, status?: ContactApprovalStatus) {
  const resolved = status ?? defaultAdminApprovalStatus;
  const approved = resolved === defaultAdminApprovalStatus;
  return {
    approvalStatus: resolved,
    approvedAt: approved ? new Date() : null,
    approvedBy: approved ? context.userId : null,
  };
}

function normalizedLookupColumns(value: {
  email?: string | null;
  mobilePhone1?: string | null;
  mobilePhone2?: string | null;
  mobilePhone3?: string | null;
}) {
  return {
    emailNormalized: normalizeContactEmail(value.email),
    mobilePhoneNormalized1: normalizeContactMobile(value.mobilePhone1),
    mobilePhoneNormalized2: normalizeContactMobile(value.mobilePhone2),
    mobilePhoneNormalized3: normalizeContactMobile(value.mobilePhone3),
  };
}

export type DuplicateCheckResult = ActionResult<{
  match: VisibleDuplicateMatch | null;
}>;

const optionalCheckText = z.string().trim().max(255).nullish();
const duplicateCheckSchema = z.object({
  firstName: z.string().trim().max(120).optional(),
  middleName: optionalCheckText,
  lastName: z.string().trim().max(120).optional(),
  email: optionalCheckText,
  mobilePhone1: optionalCheckText,
  mobilePhone2: optionalCheckText,
  mobilePhone3: optionalCheckText,
  contactId: z.uuid().optional(),
});

export async function checkContactDuplicate(
  raw: z.input<typeof duplicateCheckSchema>,
): Promise<DuplicateCheckResult> {
  let context: AuthorizationContext;
  try {
    context = await requirePermission("contacts.view");
  } catch {
    return failure(permissionDenied("You cannot check for duplicates."));
  }
  const parsed = duplicateCheckSchema.safeParse(raw);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  const input = parsed.data;
  const match = await findDuplicateMatch(
    context.organizationId,
    {
      firstName: input.firstName ?? "",
      middleName: input.middleName ?? null,
      lastName: input.lastName ?? "",
      email: input.email,
      mobilePhone1: input.mobilePhone1,
      mobilePhone2: input.mobilePhone2,
      mobilePhone3: input.mobilePhone3,
    },
    { excludeContactId: input.contactId },
  );
  return success({
    match: match ? await visibleDuplicate(context, match) : null,
  });
}

type ZodIssueLike = { path: PropertyKey[]; message: string };

function formatCsvRowError(error: { issues: ZodIssueLike[] }): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.map(String).join(".") || "row";
      return `${field}: ${issue.message}`;
    })
    .join("; ");
}

function reviewMessage(
  error: Extract<ReturnType<typeof contactSchema.safeParse>, { success: false }>["error"],
): string {
  const errors = error.flatten().fieldErrors;
  const details = Object.entries(errors)
    .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
    .join("; ");
  return details ? `Review the highlighted fields: ${details}` : "Review the highlighted fields.";
}

async function insertContact(
  context: AuthorizationContext,
  input: ContactInput,
): Promise<ContactActionResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error, reviewMessage(parsed.error));
  const value = parsed.data;
  const existing = await findDuplicateMatch(context.organizationId, value);
  // An email or mobile number belongs to one contact only; nobody may save a second one.
  if (existing?.kind === "exact")
    return failureFrom(
      ActionErrorCode.DUPLICATE,
      existing.reason === "email"
        ? "A contact with this email already exists in your organization."
        : "A contact with this mobile number already exists in your organization.",
      {
        duplicate: await visibleDuplicate(context, existing),
      } satisfies ContactErrorDetails,
    );
  const referenceError = await checkContactReferences(context, value);
  if (referenceError) return validationFailure(referenceError);
  try {
    const id = await db.transaction(async (tx) => {
      const created = await insertContactRow(tx, context, value);
      if (!created.success) throw new Error(created.error.message);
      const opened = await openDealForApprovedContact(tx, context, {
        contactId: created.data.id,
        contactName: `${value.firstName} ${value.lastName}`.trim(),
        primaryAgentUserId: value.assignedAgentId || null,
      });
      if (!opened.success) throw new Error(opened.error.message);
      return created.data.id;
    });
    return success({ id });
  } catch (error) {
    return contactWriteError(error);
  }
}

/** Drizzle transaction handle passed to the import helpers. */
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const rowFailed = Symbol("rowFailed");

/** Runs one import row in a savepoint, so a failed row rolls back alone instead of aborting the whole import. */
async function inSavepoint<T>(
  tx: DbTransaction,
  run: (sp: DbTransaction) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  let failed: ActionResult<T> | undefined;
  try {
    return await tx.transaction(async (sp) => {
      const result = await run(sp);
      if (!result.success) {
        failed = result;
        throw rowFailed;
      }
      return result;
    });
  } catch (error) {
    if (error === rowFailed && failed) return failed;
    throw error;
  }
}

type InsertedContact = {
  id: string;
  contactCode: string;
};

async function insertContactRow(
  tx: DbTransaction,
  context: AuthorizationContext,
  value: ContactInput,
  approvalStatus?: ContactApprovalStatus,
): Promise<ActionResult<InsertedContact>> {
  try {
    let brokerUserId: string | null = null;
    if (value.assignedAgentId) {
      const [agent] = await tx
        .select({ brokerId: users.brokerId })
        .from(users)
        .where(eq(users.id, value.assignedAgentId))
        .limit(1);
      brokerUserId = agent?.brokerId ?? value.assignedAgentId;
    }

    const [record] = await tx
      .insert(contacts)
      .values({
        organizationId: context.organizationId,
        contactCode: generateContactCode(),
        firstName: value.firstName,
        middleName: value.middleName,
        lastName: value.lastName,
        companyName: value.companyName,
        birthDate: value.birthDate,
        gender: value.gender,
        civilStatus: value.civilStatus,
        citizenship: value.citizenship,
        landline: value.landline,
        prcLicenseNumber: value.prcLicenseNumber,
        currentAddressLine1: value.currentAddressLine1,
        currentBarangay: value.currentBarangay,
        currentCity: value.currentCity,
        currentProvince: value.currentProvince,
        currentPostalCode: value.currentPostalCode,
        currentCountry: value.currentCountry,
        email: value.email,
        mobilePhone1: value.mobilePhone1,
        mobilePhone2: value.mobilePhone2,
        mobilePhone3: value.mobilePhone3,
        whatsappNumber: value.whatsappNumber,
        viberNumber: value.viberNumber,
        instagramHandle: value.instagramHandle,
        facebookHandle: value.facebookHandle,
        ...normalizedLookupColumns(value),
        employmentType: value.employmentType,
        annualIncome: value.annualIncome === null ? null : String(value.annualIncome),
        preferredContactMethods: value.preferredContactMethods,
        lifecycleStage: value.lifecycleStage,
        // A CSV leaves an omitted agent or development as "", which a uuid column rejects.
        assignedUserId: value.assignedAgentId || null,
        brokerUserId,
        purchaseType: value.purchaseType,
        financingPreference: value.financingPreference,
        financingPreferenceOther:
          value.financingPreference === "other" ? value.financingPreferenceOther : null,
        bankName: value.financingPreference === "bank_financing" ? value.bankName : null,
        budgetMin: value.budgetMin === null ? null : String(value.budgetMin),
        budgetMax: value.budgetMax === null ? null : String(value.budgetMax),
        preferredDevelopmentId: value.preferredDevelopmentId || null,
        preferredUnitIds: value.preferredUnitIds,
        notes: value.notes,
        marketingConsent: value.marketingConsent,
        consentRecordedAt: value.marketingConsent ? new Date() : null,
        createdBy: context.userId,
        ...approvalColumnsFor(context, approvalStatus),
      })
      .returning({ id: contacts.id, contactCode: contacts.contactCode });
    await enrollByTrigger(tx, {
      organizationId: context.organizationId,
      trigger: "lead_created",
      contactId: record.id,
    });
    if (value.assignedAgentId)
      await tx.insert(contactAssignmentHistory).values({
        contactId: record.id,
        toUserId: value.assignedAgentId,
        changedBy: context.userId,
        reason: "Initial assignment",
      });
    await tx.insert(activities).values({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      activityType: "contact.created",
      summary: `${value.firstName} ${value.lastName} was added as a contact.`,
      contactId: record.id,
    });
    await tx
      .insert(contactDocumentRequirements)
      .values(
        requiredDocumentTypes.map((item) => ({
          organizationId: context.organizationId,
          contactId: record.id,
          documentType: item.documentType,
          label: item.label,
          status: defaultRequirementStatus,
        })),
      )
      .onConflictDoNothing({
        target: [contactDocumentRequirements.contactId, contactDocumentRequirements.documentType],
      });
    await tx.insert(auditLogs).values({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "contact",
      entityId: record.id,
      newValues: {
        firstName: value.firstName,
        lastName: value.lastName,
        lifecycleStage: value.lifecycleStage,
      },
    });
    return success({ id: record.id, contactCode: record.contactCode });
  } catch (error) {
    return databaseFailure(describeWriteError(error));
  }
}
export async function createContact(input: ContactInput): Promise<ContactActionResult> {
  const context = await requirePermission("contacts.create");
  const result = await insertContact(context, input);
  if (result.success) revalidatePath("/contacts");
  return result;
}

const auditMoney = (input: unknown) => {
  if (input === undefined || input === null || input === "") return null;
  return String(input);
};

function contactAuditRow(stored: Record<string, unknown>): Record<string, unknown> {
  return {
    firstName: stored.firstName ?? null,
    middleName: stored.middleName ?? null,
    lastName: stored.lastName ?? null,
    companyName: stored.companyName ?? null,
    birthDate: stored.birthDate ?? null,
    gender: stored.gender ?? null,
    civilStatus: stored.civilStatus ?? null,
    citizenship: stored.citizenship ?? null,
    landline: stored.landline ?? null,
    prcLicenseNumber: stored.prcLicenseNumber ?? null,
    currentAddressLine1: stored.currentAddressLine1 ?? null,
    currentBarangay: stored.currentBarangay ?? null,
    currentCity: stored.currentCity ?? null,
    currentProvince: stored.currentProvince ?? null,
    currentPostalCode: stored.currentPostalCode ?? null,
    currentCountry: stored.currentCountry ?? null,
    email: stored.email ?? null,
    mobilePhone1: stored.mobilePhone1 ?? null,
    mobilePhone2: stored.mobilePhone2 ?? null,
    mobilePhone3: stored.mobilePhone3 ?? null,
    whatsappNumber: stored.whatsappNumber ?? null,
    viberNumber: stored.viberNumber ?? null,
    instagramHandle: stored.instagramHandle ?? null,
    facebookHandle: stored.facebookHandle ?? null,
    employmentType: stored.employmentType ?? null,
    annualIncome: auditMoney(stored.annualIncome),
    preferredContactMethods: sortMethods(stored.preferredContactMethods),
    lifecycleStage: stored.lifecycleStage ?? null,
    assignedUserId: stored.assignedUserId ?? null,
    brokerUserId: stored.brokerUserId ?? null,
    purchaseType: stored.purchaseType ?? null,
    financingPreference: stored.financingPreference ?? null,
    financingPreferenceOther: stored.financingPreferenceOther ?? null,
    bankName: stored.bankName ?? null,
    budgetMin: auditMoney(stored.budgetMin),
    budgetMax: auditMoney(stored.budgetMax),
    preferredDevelopmentId: stored.preferredDevelopmentId ?? null,
    preferredUnitIds: sortMethods(stored.preferredUnitIds),
    notes: stored.notes ?? null,
    marketingConsent: Boolean(stored.marketingConsent),
  };
}

function sortMethods(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string" && value
      ? value.split(",")
      : [];
  return list
    .map((item) => String(item).trim())
    .filter(Boolean)
    .sort();
}

function contactAuditInput(
  value: ContactInput,
  brokerUserId: string | null,
): Record<string, unknown> {
  return {
    firstName: value.firstName,
    middleName: value.middleName ?? null,
    lastName: value.lastName,
    companyName: value.companyName ?? null,
    birthDate: value.birthDate ?? null,
    gender: value.gender ?? null,
    civilStatus: value.civilStatus ?? null,
    citizenship: value.citizenship ?? null,
    landline: value.landline ?? null,
    prcLicenseNumber: value.prcLicenseNumber ?? null,
    currentAddressLine1: value.currentAddressLine1 ?? null,
    currentBarangay: value.currentBarangay ?? null,
    currentCity: value.currentCity ?? null,
    currentProvince: value.currentProvince ?? null,
    currentPostalCode: value.currentPostalCode ?? null,
    currentCountry: value.currentCountry ?? null,
    email: value.email ?? null,
    mobilePhone1: value.mobilePhone1 ?? null,
    mobilePhone2: value.mobilePhone2 ?? null,
    mobilePhone3: value.mobilePhone3 ?? null,
    whatsappNumber: value.whatsappNumber ?? null,
    viberNumber: value.viberNumber ?? null,
    instagramHandle: value.instagramHandle ?? null,
    facebookHandle: value.facebookHandle ?? null,
    employmentType: value.employmentType ?? null,
    annualIncome: auditMoney(value.annualIncome),
    preferredContactMethods: sortMethods(value.preferredContactMethods),
    lifecycleStage: value.lifecycleStage ?? null,
    assignedUserId: value.assignedAgentId,
    brokerUserId,
    purchaseType: value.purchaseType ?? null,
    financingPreference: value.financingPreference ?? null,
    financingPreferenceOther:
      value.financingPreference === "other" ? (value.financingPreferenceOther ?? null) : null,
    bankName: value.financingPreference === "bank_financing" ? (value.bankName ?? null) : null,
    budgetMin: auditMoney(value.budgetMin),
    budgetMax: auditMoney(value.budgetMax),
    preferredDevelopmentId: value.preferredDevelopmentId ?? null,
    preferredUnitIds: sortMethods(value.preferredUnitIds),
    notes: value.notes ?? null,
    marketingConsent: Boolean(value.marketingConsent),
  };
}

function contactChanges(
  before: Record<string, unknown>,
  value: ContactInput,
  brokerUserId: string | null,
) {
  return buildChangeSet(contactAuditRow(before), contactAuditInput(value, brokerUserId));
}

export async function updateContact(id: string, input: ContactInput): Promise<ContactActionResult> {
  const context = await requirePermission("contacts.update");
  if (!(await canAccessResource(context, { type: "contact", id })))
    return notFoundFailure("Contact");
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error, reviewMessage(parsed.error));
  const value = parsed.data;
  const [existing] = await db
    .select({
      assignedUserId: contacts.assignedUserId,
    })
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.organizationId, context.organizationId)))
    .limit(1);
  if (!existing) return notFoundFailure("Contact");
  const duplicate = await findDuplicateMatch(context.organizationId, value, {
    excludeContactId: id,
  });
  if (duplicate?.kind === "exact")
    return failureFrom(
      ActionErrorCode.DUPLICATE,
      duplicate.reason === "email"
        ? "Another contact already has this email."
        : "Another contact already has this mobile number.",
      { duplicate: await visibleDuplicate(context, duplicate) } satisfies ContactErrorDetails,
    );
  if (
    value.assignedAgentId !== existing.assignedUserId &&
    !context.permissions.has("contacts.reassign_broker")
  )
    return failure(permissionDenied("You don't have permission to reassign this contact."));
  if (
    existing.assignedUserId !== value.assignedAgentId &&
    !(await validateAssignee(context, value.assignedAgentId))
  )
    return validationFailure("Select an active agent or broker.");
  const referenceError = await checkContactReferences(context, {
    // An unchanged agent is kept even if they no longer qualify as a new pick.
    assignedAgentId: existing.assignedUserId === value.assignedAgentId ? "" : value.assignedAgentId,
    preferredDevelopmentId: value.preferredDevelopmentId,
    preferredUnitIds: value.preferredUnitIds,
  });
  if (referenceError) return validationFailure(referenceError);
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.organizationId, context.organizationId)))
        .limit(1);
      if (!before) throw new Error("Contact not found");

      let brokerUserId = before.brokerUserId;
      if (value.assignedAgentId && value.assignedAgentId !== before.assignedUserId) {
        const [agent] = await tx
          .select({ brokerId: users.brokerId })
          .from(users)
          .where(eq(users.id, value.assignedAgentId))
          .limit(1);
        brokerUserId = agent?.brokerId ?? value.assignedAgentId;
      }

      await tx
        .update(contacts)
        .set({
          firstName: value.firstName,
          middleName: value.middleName,
          lastName: value.lastName,
          companyName: value.companyName,
          birthDate: value.birthDate,
          gender: value.gender,
          civilStatus: value.civilStatus,
          citizenship: value.citizenship,
          landline: value.landline,
          prcLicenseNumber: value.prcLicenseNumber,
          currentAddressLine1: value.currentAddressLine1,
          currentBarangay: value.currentBarangay,
          currentCity: value.currentCity,
          currentProvince: value.currentProvince,
          currentPostalCode: value.currentPostalCode,
          currentCountry: value.currentCountry,
          email: value.email,
          mobilePhone1: value.mobilePhone1,
          mobilePhone2: value.mobilePhone2,
          mobilePhone3: value.mobilePhone3,
          whatsappNumber: value.whatsappNumber,
          viberNumber: value.viberNumber,
          instagramHandle: value.instagramHandle,
          facebookHandle: value.facebookHandle,
          ...normalizedLookupColumns(value),
          employmentType: value.employmentType,
          annualIncome: value.annualIncome === null ? null : String(value.annualIncome),
          preferredContactMethods: value.preferredContactMethods,
          lifecycleStage: value.lifecycleStage,
          assignedUserId: value.assignedAgentId,
          brokerUserId,
          purchaseType: value.purchaseType,
          financingPreference: value.financingPreference,
          financingPreferenceOther:
            value.financingPreference === "other" ? value.financingPreferenceOther : null,
          bankName: value.financingPreference === "bank_financing" ? value.bankName : null,
          budgetMin: value.budgetMin === null ? null : String(value.budgetMin),
          budgetMax: value.budgetMax === null ? null : String(value.budgetMax),
          preferredDevelopmentId: value.preferredDevelopmentId,
          preferredUnitIds: value.preferredUnitIds,
          notes: value.notes,
          marketingConsent: value.marketingConsent,
          consentRecordedAt:
            value.marketingConsent && !before.marketingConsent
              ? new Date()
              : before.consentRecordedAt,
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.id, id), eq(contacts.organizationId, context.organizationId)));
      if (before.assignedUserId !== value.assignedAgentId) {
        await tx.insert(contactAssignmentHistory).values({
          contactId: id,
          fromUserId: before.assignedUserId,
          toUserId: value.assignedAgentId,
          changedBy: context.userId,
          reason: "Contact updated",
        });
        await moveOpenDeals(tx, {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          contactId: id,
          primaryAgentUserId: value.assignedAgentId || null,
          brokerUserId,
        });
      }
      if (before.brokerUserId !== brokerUserId && brokerUserId) {
        await tx.insert(contactBrokerHistory).values({
          contactId: id,
          fromBrokerUserId: before.brokerUserId,
          toBrokerUserId: brokerUserId,
          changedBy: context.userId,
          reason: "Agent reassigned",
          changedAt: new Date(),
        });
      }
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "contact.updated",
        summary: `${value.firstName} ${value.lastName} was updated.`,
        contactId: id,
      });
      const changes = contactChanges(before, value, brokerUserId);
      if (!isEmptyChangeSet(changes))
        await tx.insert(auditLogs).values({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "update",
          entityType: "contact",
          entityId: id,
          oldValues: changes.oldValues,
          newValues: changes.newValues,
        });
    });
    revalidatePath(`/contacts/${id}`);
    revalidatePath("/contacts");
    return success({ id });
  } catch (error) {
    return contactWriteError(error);
  }
}

export async function archiveContact(id: string): Promise<ContactActionResult> {
  let context: AuthorizationContext;
  try {
    context = await requirePermission("contacts.delete");
  } catch {
    return failure(permissionDenied("You can't archive contacts."));
  }
  if (!(await canAccessResource(context, { type: "contact", id })))
    return notFoundFailure("Contact");
  try {
    const archived = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          deletedAt: contacts.deletedAt,
        })
        .from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.organizationId, context.organizationId)))
        .limit(1);
      if (!before || before.deletedAt) return null;
      // Archiving hides the contact's deals, so a deal holding inventory or money would be stranded.
      const [holding] = await tx
        .select({ code: deals.dealCode })
        .from(dealContacts)
        .innerJoin(deals, eq(dealContacts.dealId, deals.id))
        .where(
          and(
            eq(dealContacts.contactId, id),
            eq(dealContacts.isPrimary, true),
            isNull(deals.deletedAt),
            inArray(deals.status, ["open", "won"]),
            sql`(${deals.unitId} is not null or cardinality(${deals.unitIds}) > 0 or cardinality(${deals.parkingSlotIds}) > 0
              or exists (select 1 from "bills" b join "payments" p on p."bill_id" = b."id" where b."deal_id" = ${deals.id} and p."deleted_at" is null))`,
          ),
        )
        .limit(1);
      if (holding) return { blocked: holding.code };
      await tx
        .update(contacts)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(contacts.id, id),
            eq(contacts.organizationId, context.organizationId),
            isNull(contacts.deletedAt),
          ),
        );
      // Nobody works an archived contact: close its open tasks and stop its sequences.
      await tx
        .update(tasks)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(tasks.contactId, id), inArray(tasks.status, ["todo", "in_progress"])));
      await tx
        .update(automationEnrollments)
        .set({ status: "cancelled", completedAt: new Date() })
        .where(
          and(eq(automationEnrollments.contactId, id), eq(automationEnrollments.status, "active")),
        );
      // Their upcoming viewings would otherwise keep holding the agent's time.
      await tx
        .update(propertyViewings)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(propertyViewings.contactId, id),
            inArray(propertyViewings.status, ["scheduled", "confirmed"]),
            sql`exists (select 1 from "calendar_events" e where e."id" = ${propertyViewings.eventId} and e."start_at" >= now())`,
          ),
        );
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "contact.archived",
        summary: `${before.firstName} ${before.lastName} was archived.`,
        contactId: id,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "contact",
        entityId: id,
        oldValues: { deletedAt: null },
        newValues: { deletedAt: new Date().toISOString() },
      });
      return true;
    });
    if (!archived) return failure(conflict("Contact was already archived."));
    if (archived !== true)
      return failure(
        conflict(
          `Opportunity ${archived.blocked} holds units or payments. Close or clear it before archiving.`,
        ),
      );
    revalidatePath("/contacts");
    revalidatePath("/contacts/archive");
    revalidatePath(`/contacts/${id}`);
    return success({ id });
  } catch (error) {
    return contactWriteError(error);
  }
}

/** Reverse `archiveContact` by clearing `deleted_at` and logging the change. */
export async function restoreContact(id: string): Promise<ContactActionResult> {
  let context: AuthorizationContext;
  try {
    context = await requirePermission("contacts.delete");
  } catch {
    return failure(permissionDenied("You can't restore contacts."));
  }
  const scope = hasOrganizationWideAccess(context)
    ? undefined
    : dataScopeCondition(context, {
        organizationId: contacts.organizationId,
        ownerUserId: contacts.assignedUserId,
        brokerUserId: contacts.brokerUserId,
      });
  try {
    const restored = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          deletedAt: contacts.deletedAt,
          expiredAt: contacts.expiredAt,
          middleName: contacts.middleName,
          email: contacts.email,
          mobilePhone1: contacts.mobilePhone1,
          mobilePhone2: contacts.mobilePhone2,
          mobilePhone3: contacts.mobilePhone3,
        })
        .from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.organizationId, context.organizationId), scope))
        .limit(1);
      if (!before || !before.deletedAt) return null;
      if (before.expiredAt) return "expired" as const;
      // The email or mobile may have gone to a new contact while this one was archived.
      const duplicate = await findDuplicateMatch(context.organizationId, before, {
        excludeContactId: id,
      });
      if (duplicate?.kind === "exact") return duplicate;
      await tx
        .update(contacts)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(contacts.id, id),
            eq(contacts.organizationId, context.organizationId),
            isNotNull(contacts.deletedAt),
          ),
        );
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "contact.restored",
        summary: `${before.firstName} ${before.lastName} was restored.`,
        contactId: id,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "contact",
        entityId: id,
        oldValues: { deletedAt: before.deletedAt.toISOString() },
        newValues: { deletedAt: null },
      });
      return true;
    });
    if (!restored) return failure(conflict("Contact is not archived."));
    if (restored === "expired") return failure(conflict("Expired lead. Add it as a new contact."));
    if (restored !== true)
      return failureFrom(
        ActionErrorCode.DUPLICATE,
        restored.reason === "email"
          ? "Another contact now uses this email. Merge or edit it before restoring."
          : "Another contact now uses this mobile number. Merge or edit it before restoring.",
        { duplicate: await visibleDuplicate(context, restored) } satisfies ContactErrorDetails,
      );
    revalidatePath("/contacts");
    revalidatePath("/contacts/archive");
    revalidatePath(`/contacts/${id}`);
    return success({ id });
  } catch (error) {
    return contactWriteError(error);
  }
}

export async function addContactNote(input: {
  contactId: string;
  note: string;
  isPinned: boolean;
}): Promise<ContactActionResult> {
  const context = await requirePermission("contacts.update");
  const parsed = noteSchema.safeParse(input);
  if (
    !parsed.success ||
    !(await canAccessResource(context, {
      type: "contact",
      id: input.contactId,
    }))
  )
    return validationFailure("The note could not be saved.");
  await db.transaction(async (tx) => {
    const [note] = await tx
      .insert(contactNotes)
      .values({
        contactId: parsed.data.contactId,
        authorUserId: context.userId,
        note: parsed.data.note,
        isPinned: parsed.data.isPinned,
      })
      .returning({ id: contactNotes.id });
    await tx.insert(auditLogs).values({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "contact_note",
      entityId: note.id,
      newValues: {
        contactId: parsed.data.contactId,
        isPinned: parsed.data.isPinned,
        characters: parsed.data.note.length,
      },
    });
    await tx.insert(activities).values({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      activityType: "contact.note_added",
      summary: "A note was added to the contact.",
      contactId: parsed.data.contactId,
    });
  });
  revalidatePath(`/contacts/${parsed.data.contactId}`);
  return success({ id: parsed.data.contactId });
}

export type ContactImportSummary = {
  created: number;
  skipped: number;
  flagged: number;
  invalid: number;
  total: number;
  rows: ImportRowResult[];
};

export type ContactImportResult = ActionResult<{
  message: string;
  summary: ContactImportSummary;
}>;

export interface ContactImportErrorDetails {
  summary: ContactImportSummary;
}

export async function importContactsCsv(formData: FormData): Promise<ContactImportResult> {
  let context: AuthorizationContext;
  try {
    context = await requirePermission("contacts.import");
  } catch {
    return failure(
      permissionDenied(
        "You do not have permission to import contacts. Ask an administrator for the contacts.import permission.",
      ),
    );
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 2_000_000)
    return validationFailure("Choose a CSV file smaller than 2 MB.");
  let rows: Record<string, string>[];
  try {
    rows = parse(await file.text(), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch {
    return validationFailure("Couldn't read the CSV. Check its format.");
  }
  if (rows.length === 0) return validationFailure("The CSV has no data rows to import.");
  if (rows.length > 1000) return validationFailure("Imports are limited to 1,000 rows.");
  try {
    return await runImport(context, rows);
  } catch (error) {
    logError("Contact import failed", error, { operation: "contact_import" });
    return databaseFailure(
      "The import could not be completed because of a server error. Please try again or contact an administrator.",
    );
  }
}

async function runImport(
  context: AuthorizationContext,
  rows: Record<string, string>[],
): Promise<ContactImportResult> {
  const [job] = await db
    .insert(dataJobs)
    .values({
      organizationId: context.organizationId,
      jobType: "import",
      entityType: "contacts",
      status: "processing",
      rowCount: rows.length,
      requestedBy: context.userId,
      startedAt: new Date(),
    })
    .returning();

  const summary: ContactImportSummary = {
    created: 0,
    skipped: 0,
    flagged: 0,
    invalid: 0,
    total: rows.length,
    rows: [],
  };
  const seen: DuplicateCandidate[] = [];

  try {
    await db.transaction(async (tx) => {
      for (let index = 0; index < rows.length; index++) {
        const rowNumber = index + 1;
        const parsed = parseContactCsvRow(rows[index]);
        if (!parsed.success) {
          summary.invalid++;
          summary.rows.push({
            row: rowNumber,
            status: "flagged",
            reason: formatCsvRowError(parsed.error),
          });
          continue;
        }
        // Every contact is approved on save, so its deal opens; a CSV approval column is ignored.
        const value = parsed.data;
        // CSV ids are typed by hand: never trust them to be in this organization.
        const referenceError = await checkContactReferences(context, value);
        if (referenceError) {
          summary.invalid++;
          summary.rows.push({ row: rowNumber, status: "flagged", reason: referenceError });
          continue;
        }

        const inFile = findDuplicateInSet(seen, value);
        const match = inFile ?? (await findDuplicateMatch(context.organizationId, value));

        // An email or mobile number belongs to one contact only, so a matching row is never imported.
        if (match?.kind === "exact") {
          const reachable =
            Boolean(inFile) ||
            (await canAccessResource(context, { type: "contact", id: match.contact.id }));
          const field = match.reason === "email" ? "email" : "mobile number";
          summary.skipped++;
          // Out-of-scope matches stay anonymous: no code or id.
          summary.rows.push(
            reachable
              ? {
                  row: rowNumber,
                  status: "skipped",
                  reason: inFile
                    ? `Same ${field} as an earlier row in this file.`
                    : `This ${field} is already on ${match.contact.contactCode}.`,
                  contactId: inFile ? undefined : match.contact.id,
                }
              : {
                  row: rowNumber,
                  status: "skipped",
                  reason: `This ${field} is already on a contact outside your access.`,
                },
          );
          continue;
        }

        const created = await inSavepoint(tx, async (sp) => {
          const inserted = await insertContactRow(sp, context, value);
          if (inserted.success) {
            const opened = await openDealForApprovedContact(sp, context, {
              contactId: inserted.data.id,
              contactName: `${value.firstName} ${value.lastName}`.trim(),
              primaryAgentUserId: value.assignedAgentId || null,
            });
            // Returned, not thrown, so only this row's savepoint rolls back.
            if (!opened.success) return databaseFailure(opened.error.message);
          }
          return inserted;
        });
        if (!created.success) {
          summary.flagged++;
          summary.rows.push({
            row: rowNumber,
            status: "flagged",
            reason: created.error.message,
          });
          continue;
        }
        summary.created++;
        summary.rows.push({
          row: rowNumber,
          status: "created",
          reason:
            match?.kind === "name"
              ? `Created, but ${match.contact.contactCode} has the same name.`
              : `Created contact ${created.data.contactCode}.`,
          contactId: created.data.id,
        });
        if (match?.kind === "name") summary.flagged++;
        seen.push({
          id: created.data.id,
          contactCode: created.data.contactCode,
          firstName: value.firstName,
          lastName: value.lastName,
          email: value.email,
          mobilePhone1: value.mobilePhone1,
          mobilePhone2: value.mobilePhone2,
          mobilePhone3: value.mobilePhone3,
        });
      }
    });
  } catch (error) {
    // Nothing was saved; close the job so it does not sit at "processing".
    await db
      .update(dataJobs)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(dataJobs.id, job.id));
    logError("Contact import failed", error, { operation: "contact_import" });
    return databaseFailure("The import could not be completed. Nothing was saved.");
  }

  await db
    .update(dataJobs)
    .set({
      status: "completed",
      successCount: summary.created,
      failureCount: summary.skipped + summary.flagged + summary.invalid,
      completedAt: new Date(),
    })
    .where(eq(dataJobs.id, job.id));

  if (summary.created > 0) revalidatePath("/contacts");

  const problems = summary.skipped + summary.flagged + summary.invalid;
  const message =
    `Imported ${summary.created} contact(s); ` +
    `${summary.skipped} duplicate(s) not imported, ${summary.flagged} flagged, ${summary.invalid} invalid.`;
  if (problems < rows.length) return success({ message, summary });
  return failureFrom(ActionErrorCode.VALIDATION_ERROR, message, {
    summary,
  } satisfies ContactImportErrorDetails);
}

export type ReassignContactBrokerResult = ActionResult<{
  message: string;
  reassignedCount: number;
  skippedCount: number;
}>;

/** Rolls the reassignment back when a selected contact has a won sale and there is no override. */
class WonSalesLocked extends Error {
  constructor(readonly lockedContacts: string[]) {
    super("Contacts with won sales");
  }
}

export async function reassignContactBroker(input: unknown): Promise<ReassignContactBrokerResult> {
  const context = await requirePermission("contacts.reassign_broker");
  if (!hasOrganizationWideAccess(context)) {
    return failure(permissionDenied('Reassigning brokers needs "See all records".'));
  }

  const parsed = z
    .object({
      contactIds: z.array(z.uuid()).min(1).max(500),
      toBrokerUserId: z.uuid(),
      reason: z.string().trim().min(1).max(1000),
      overrideClosedWon: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success)
    return validationFailureFromZod(
      parsed.error,
      "Select contacts and a broker, and give a reason.",
    );
  const { contactIds, toBrokerUserId, reason, overrideClosedWon } = parsed.data;

  // Check if user is super admin for override
  const isSuperAdmin = context.roles.some((r) => r === "super-administrator");
  if (overrideClosedWon && !isSuperAdmin) {
    return failure(
      permissionDenied("Only super administrators can override the lock on won sales."),
    );
  }

  const [targetBroker] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(
      roles,
      and(eq(userRoles.roleId, roles.id), eq(roles.organizationId, context.organizationId)),
    )
    .where(
      and(
        eq(users.id, toBrokerUserId),
        eq(users.organizationId, context.organizationId),
        eq(users.status, "active"),
        isNull(users.deletedAt),
        inArray(roles.slug, [...brokerRoleSlugs]),
      ),
    )
    .limit(1);
  if (!targetBroker) return validationFailure("Select an active broker in your organization.");

  const changedBy = context.userId;

  let result: { reassignedCount: number; skippedCount: number; lockedContacts: string[] };
  try {
    result = await db.transaction(async (tx) => {
      // Lock the contacts' deals first, so none can be won between the check and the move.
      const dealRows = await tx
        .select({ contactId: dealContacts.contactId, status: deals.status })
        .from(dealContacts)
        .innerJoin(deals, eq(dealContacts.dealId, deals.id))
        .where(
          and(
            inArray(dealContacts.contactId, contactIds),
            eq(deals.organizationId, context.organizationId),
            isNull(deals.deletedAt),
          ),
        )
        .for("share", { of: deals });
      const lockedContacts = [
        ...new Set(dealRows.filter((row) => row.status === "won").map((row) => row.contactId)),
      ];
      if (!overrideClosedWon && lockedContacts.length) throw new WonSalesLocked(lockedContacts);

      const current = await tx
        .select({ id: contacts.id, brokerUserId: contacts.brokerUserId })
        .from(contacts)
        .where(
          and(
            inArray(contacts.id, contactIds),
            eq(contacts.organizationId, context.organizationId),
          ),
        )
        .for("update");

      let reassignedCount = 0;
      let skippedCount = 0;
      for (const contact of current) {
        // Already on the target broker, or no broker at all (the CHECK constraint forbids that).
        if (contact.brokerUserId === toBrokerUserId || !contact.brokerUserId) {
          skippedCount++;
          continue;
        }
        await tx
          .update(contacts)
          .set({ brokerUserId: toBrokerUserId })
          .where(
            and(eq(contacts.id, contact.id), eq(contacts.organizationId, context.organizationId)),
          );
        await tx.insert(contactBrokerHistory).values({
          contactId: contact.id,
          fromBrokerUserId: contact.brokerUserId,
          toBrokerUserId,
          changedBy,
          reason,
          changedAt: new Date(),
        });
        await moveOpenDeals(tx, {
          organizationId: context.organizationId,
          actorUserId: changedBy,
          contactId: contact.id,
          brokerUserId: toBrokerUserId,
        });
        if (lockedContacts.includes(contact.id))
          await tx.insert(auditLogs).values({
            organizationId: context.organizationId,
            actorUserId: changedBy,
            action: "CONTACT_BROKER_OVERRIDE",
            entityType: "contact",
            entityId: contact.id,
            newValues: { reason },
            ipAddress: null,
            userAgent: null,
          });
        reassignedCount++;
      }
      return { reassignedCount, skippedCount, lockedContacts };
    });
  } catch (error) {
    if (!(error instanceof WonSalesLocked)) throw error;
    return failureFrom(
      ActionErrorCode.CONFLICT,
      `${error.lockedContacts.length} contact(s) have won sales and cannot be reassigned. A super administrator can override this.`,
      { lockedContacts: error.lockedContacts } satisfies ContactErrorDetails,
    );
  }

  revalidatePath("/contacts");
  revalidatePath("/deals/[id]", "page");

  const overrideMessage = overrideClosedWon
    ? ` (with the won-sales override for ${result.lockedContacts.length} contact(s))`
    : "";

  const skipMessage =
    result.skippedCount > 0
      ? ` ${result.skippedCount} contact(s) skipped (already on target broker).`
      : "";

  return success({
    message: `Reassigned ${result.reassignedCount} contact(s) to new broker.${skipMessage}${overrideMessage}`,
    reassignedCount: result.reassignedCount,
    skippedCount: result.skippedCount,
  });
}
