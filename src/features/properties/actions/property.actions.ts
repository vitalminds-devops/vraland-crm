"use server";

import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { nextRecordCode } from "@/lib/record-codes";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  deals,
  developments,
  properties,
  propertyFeatureValues,
  propertyParkingSlots,
  units,
  propertyAccessGrants,
  propertyFeatures,
  propertyStatusHistory,
} from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import {
  hasUnrestrictedInventoryAccess,
  type AuthorizationContext,
} from "@/lib/permissions/policy";
import { canWriteProperty } from "../queries/property-scope.queries";
import { syncParkingCount } from "../lib/parking-sync";
import { propertySchema, type PropertyInput } from "../schemas/property.schema";
import { logError } from "@/lib/logger";
import {
  ActionResult,
  success,
  failure,
  validationFailure as validationFailureResult,
  databaseFailure,
} from "@/lib/types/action-result";
import { outOfScope, validationError } from "@/lib/errors";

export type PropertyActionResult =
  | { success: true; id: string }
  | { success: false; message: string; errors?: Record<string, string[]> };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const money = (value: number | null) => (value === null ? null : String(value));

/**
 * Convert new ActionResult to legacy PropertyActionResult for backward compatibility.
 */
function toLegacyResult(result: ActionResult<{ id: string }>): PropertyActionResult {
  if (result.success) {
    return { success: true, id: result.data.id };
  }
  return {
    success: false,
    message: result.error.message,
  };
}

/**
 * Convert legacy-style validation error to ActionResult.
 */
function handleValidationError(error: {
  flatten: () => { fieldErrors: Record<string, string[]> };
}): ActionResult<{ id: string }> {
  const errors = error.flatten().fieldErrors;
  const details = Object.entries(errors)
    .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
    .join("; ");
  return validationFailureResult(
    `Review the highlighted fields${details ? `: ${details}` : "."}`,
    errors,
  );
}

/**
 * Handle database errors with logging.
 */
function handleDatabaseError(error: unknown): ActionResult<{ id: string }> {
  logError("Property write failed", error, { operation: "property_write" });
  const cause = error instanceof Error && error.cause ? error.cause : error;
  const detail =
    (cause as { detail?: string; message?: string; code?: string })?.detail ||
    (cause as { message?: string })?.message;
  return databaseFailure(
    process.env.NODE_ENV === "development" && detail
      ? `Couldn't save property: ${detail}`
      : "Couldn't save the property. Try again.",
    detail,
  );
}

async function validateRelations(context: AuthorizationContext, value: PropertyInput) {
  const { organizationId } = context;
  if (value.developmentId) {
    const [row] = await db
      .select({ id: developments.id })
      .from(developments)
      .where(
        and(
          eq(developments.id, value.developmentId),
          eq(developments.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!row) return "The selected development is unavailable.";
  }
  return null;
}
async function syncFeatures(tx: Tx, organizationId: string, propertyId: string, input: string) {
  const names = [
    ...new Set(
      input
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ].slice(0, 30);
  await tx.delete(propertyFeatureValues).where(eq(propertyFeatureValues.propertyId, propertyId));
  for (const name of names) {
    const [feature] = await tx
      .insert(propertyFeatures)
      .values({ organizationId, name, valueType: "boolean" })
      .onConflictDoUpdate({
        target: [propertyFeatures.organizationId, propertyFeatures.name],
        set: { name },
      })
      .returning({ id: propertyFeatures.id });
    await tx
      .insert(propertyFeatureValues)
      .values({ propertyId, featureId: feature.id, booleanValue: true });
  }
}
const valuesFor = (value: PropertyInput, context: { organizationId: string; userId: string }) => ({
  organizationId: context.organizationId,
  developmentId: value.developmentId,
  title: value.title,
  description: value.description,
  propertyType: value.propertyType,
  listingType: value.listingType,
  status: value.status,
  currency: value.currency,
  parkingSpaces: value.parkingSpaces,
  addressLine1: value.addressLine1,
  addressLine2: value.addressLine2,
  barangay: value.barangay,
  city: value.city,
  province: value.province,
  postalCode: value.postalCode,
  latitude: money(value.latitude),
  longitude: money(value.longitude),
  listedAt: value.listedAt ? new Date(`${value.listedAt}T00:00:00Z`) : null,
  availableFrom: value.availableFrom,
  contractStartDate: value.contractStartDate,
  contractEndDate: value.contractEndDate,
  unitIdentifierStyle: value.unitIdentifierStyle,
  updatedBy: context.userId,
  updatedAt: new Date(),
});

export async function createProperty(input: PropertyInput): Promise<PropertyActionResult> {
  const context = await requirePermission("properties.create");
  // Floors, units and parking are added on the property's page after it is saved.
  const parsed = propertySchema.safeParse({
    ...input,
    floorCount: null,
    unitsPerFloor: null,
    parkingSpaces: null,
  });
  if (!parsed.success) return toLegacyResult(handleValidationError(parsed.error));

  const relationError = await validateRelations(context, parsed.data);
  if (relationError) {
    return toLegacyResult(failure(validationError(relationError)));
  }

  try {
    const id = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(properties)
        .values({
          ...valuesFor(parsed.data, context),
          propertyCode: await nextRecordCode(tx, context.organizationId, "property"),
          createdBy: context.userId,
        })
        .returning({ id: properties.id });
      // Restricted roles only see granted properties, so the creator needs a whole-property grant.
      if (!hasUnrestrictedInventoryAccess(context))
        await tx.insert(propertyAccessGrants).values({
          userId: context.userId,
          propertyId: record.id,
          createdBy: context.userId,
          updatedBy: context.userId,
        });
      await syncFeatures(tx, context.organizationId, record.id, parsed.data.features);
      await tx.insert(propertyStatusHistory).values({
        propertyId: record.id,
        toStatus: parsed.data.status,
        changedBy: context.userId,
        note: "Property created",
      });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "property.created",
        summary: `${parsed.data.title} was added to Properties.`,
        propertyId: record.id,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "property",
        entityId: record.id,
        newValues: {
          title: parsed.data.title,
          status: parsed.data.status,
        },
      });
      return record.id;
    });
    revalidatePath("/properties");
    return toLegacyResult(success({ id }));
  } catch (error) {
    return toLegacyResult(handleDatabaseError(error));
  }
}

export async function updateProperty(
  id: string,
  input: PropertyInput,
): Promise<PropertyActionResult> {
  const context = await requirePermission("properties.update");
  if (!(await canWriteProperty(context, id))) {
    return toLegacyResult(failure(outOfScope()));
  }

  const parsed = propertySchema.safeParse({ ...input, floorCount: null, unitsPerFloor: null });
  if (!parsed.success) return toLegacyResult(handleValidationError(parsed.error));

  const relationError = await validateRelations(context, parsed.data);
  if (relationError) {
    return toLegacyResult(failure(validationError(relationError)));
  }

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.organizationId, context.organizationId)))
        .limit(1);
      if (!before) throw new Error("Property not found");
      await tx
        .update(properties)
        .set(valuesFor(parsed.data, context))
        .where(and(eq(properties.id, id), eq(properties.organizationId, context.organizationId)));
      await syncFeatures(tx, context.organizationId, id, parsed.data.features);
      // Parking slots are managed on the property page; keep the count in step with them.
      await syncParkingCount(tx, id);
      if (before.status !== parsed.data.status)
        await tx.insert(propertyStatusHistory).values({
          propertyId: id,
          fromStatus: before.status,
          toStatus: parsed.data.status,
          changedBy: context.userId,
          note: "Status changed during property update",
        });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "property.updated",
        summary: `${parsed.data.title} was updated.`,
        propertyId: id,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "property",
        entityId: id,
        oldValues: { status: before.status },
        newValues: { status: parsed.data.status, title: parsed.data.title },
      });
    });
    revalidatePath("/properties");
    revalidatePath(`/properties/${id}`);
    return toLegacyResult(success({ id }));
  } catch (error) {
    return toLegacyResult(handleDatabaseError(error));
  }
}

/** Hides the property everywhere (deleted_at) until restored from /properties/archive. */
export async function archiveProperty(id: string): Promise<PropertyActionResult> {
  const context = await requirePermission("properties.delete");
  if (!(await canWriteProperty(context, id))) return toLegacyResult(failure(outOfScope()));
  try {
    const result = await db.transaction(async (tx) => {
      // Locked so no deal can reserve a unit or slot here between this check and the archive.
      await tx.select({ id: units.id }).from(units).where(eq(units.propertyId, id)).for("update");
      await tx
        .select({ id: propertyParkingSlots.id })
        .from(propertyParkingSlots)
        .where(eq(propertyParkingSlots.propertyId, id))
        .for("update");
      // An open deal still reserves this property's units, which archiving would make unavailable.
      // Older deals have no building link, so their held units and slots count too.
      const openDeals = await tx
        .select({ code: deals.dealCode })
        .from(deals)
        .where(
          and(
            eq(deals.status, "open"),
            isNull(deals.deletedAt),
            or(
              eq(deals.propertyId, id),
              sql`exists (select 1 from "units" u where u."reserved_deal_id" = ${deals.id} and u."building_id" = ${id})`,
              sql`exists (select 1 from "parking_slots" s where s."reserved_deal_id" = ${deals.id} and s."building_id" = ${id})`,
            ),
          ),
        )
        .limit(4);
      if (openDeals.length) return { openDeals: openDeals.map((deal) => deal.code) };
      const [archived] = await tx
        .update(properties)
        .set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: context.userId })
        .where(
          and(
            eq(properties.id, id),
            eq(properties.organizationId, context.organizationId),
            isNull(properties.deletedAt),
          ),
        )
        .returning({ title: properties.title });
      if (!archived) return null;
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "property.archived",
        summary: `${archived.title} was archived.`,
        propertyId: id,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "property",
        entityId: id,
        oldValues: { title: archived.title, deletedAt: null },
        newValues: { deletedAt: new Date().toISOString() },
      });
      return "archived" as const;
    });
    if (result && typeof result === "object") {
      const shown = result.openDeals.slice(0, 3).join(", ");
      const more = result.openDeals.length > 3 ? " and more" : "";
      return {
        success: false,
        message: `Still used by open opportunities: ${shown}${more}. Close or win them first.`,
      };
    }
    if (!result) return { success: false, message: "Property was already archived." };
    revalidatePath("/properties");
    revalidatePath("/properties/archive");
    return toLegacyResult(success({ id }));
  } catch (error) {
    return toLegacyResult(handleDatabaseError(error));
  }
}

export async function restoreProperty(id: string): Promise<PropertyActionResult> {
  const context = await requirePermission("properties.delete");
  if (!(await canWriteProperty(context, id, { archived: true })))
    return toLegacyResult(failure(outOfScope()));
  try {
    const restored = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(properties)
        .set({ deletedAt: null, updatedAt: new Date(), updatedBy: context.userId })
        .where(
          and(
            eq(properties.id, id),
            eq(properties.organizationId, context.organizationId),
            isNotNull(properties.deletedAt),
          ),
        )
        .returning({ title: properties.title });
      if (!row) return false;
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "property.restored",
        summary: `${row.title} was restored.`,
        propertyId: id,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "restore",
        entityType: "property",
        entityId: id,
        oldValues: { title: row.title },
        newValues: { deletedAt: null },
      });
      return true;
    });
    if (!restored) return { success: false, message: "Property is not archived." };
    revalidatePath("/properties");
    revalidatePath("/properties/archive");
    revalidatePath(`/properties/${id}`);
    return toLegacyResult(success({ id }));
  } catch (error) {
    return toLegacyResult(handleDatabaseError(error));
  }
}
