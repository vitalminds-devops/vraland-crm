import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { properties } from "@/db/schema";
import type { AuthorizationContext } from "@/lib/permissions/policy";
import { grantedPropertyCondition } from "@/lib/permissions/property-access";
import { dataScopeCondition } from "@/lib/permissions/scope";

// Writes also need the property-access grant, so nobody edits a listing they cannot see.
export function propertyWriteScope(context: AuthorizationContext) {
  return and(
    dataScopeCondition(context, {
      organizationId: properties.organizationId,
      ownerUserId: properties.createdBy,
    }),
    grantedPropertyCondition(context, { propertyId: properties.id }),
  );
}

/** `archived` checks an archived property instead, for restoring it. */
export async function canWriteProperty(
  context: AuthorizationContext,
  id: string,
  { archived = false } = {},
): Promise<boolean> {
  const [record] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.id, id),
        eq(properties.organizationId, context.organizationId),
        archived ? isNotNull(properties.deletedAt) : isNull(properties.deletedAt),
        propertyWriteScope(context),
      ),
    )
    .limit(1);
  return Boolean(record);
}

/** The ids in `ids` that `canWriteProperty` would allow, in one query. */
export async function writablePropertyIds(
  context: AuthorizationContext,
  ids: string[],
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        inArray(properties.id, ids),
        eq(properties.organizationId, context.organizationId),
        isNull(properties.deletedAt),
        propertyWriteScope(context),
      ),
    );
  return new Set(rows.map((row) => row.id));
}
