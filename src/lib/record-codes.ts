import "server-only";

import { sql } from "drizzle-orm";
import type { db } from "@/db";
import { codeCounters, contacts, deals, developments, properties } from "@/db/schema";
import { formatRecordCode, recordCodeFormats, type RecordCodeKind } from "@/lib/utils/record-code";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const codeColumns = {
  opportunity: { table: deals, code: deals.dealCode, organizationId: deals.organizationId },
  contact: { table: contacts, code: contacts.contactCode, organizationId: contacts.organizationId },
  property: {
    table: properties,
    code: properties.propertyCode,
    organizationId: properties.organizationId,
  },
  development: {
    table: developments,
    code: developments.code,
    organizationId: developments.organizationId,
  },
};

/**
 * The organization's next code of this kind. The counter row stays locked until the transaction
 * ends, so two records created at once never share a number. Its first use starts after the
 * highest number already given out, so codes from the migration or a seed are never reused.
 */
export async function nextRecordCode(
  tx: Transaction,
  organizationId: string,
  kind: RecordCodeKind,
): Promise<string> {
  const { table, code, organizationId: organizationColumn } = codeColumns[kind];
  const pattern = `^${recordCodeFormats[kind].prefix}-([0-9]+)$`;
  const [row] = await tx
    .insert(codeCounters)
    .values({
      organizationId,
      kind,
      lastValue: sql`(select coalesce(max(substring(${code} from ${pattern})::int), 0) + 1
        from ${table} where ${organizationColumn} = ${organizationId})`,
    })
    .onConflictDoUpdate({
      target: [codeCounters.organizationId, codeCounters.kind],
      set: { lastValue: sql`${codeCounters.lastValue} + 1` },
    })
    .returning({ value: codeCounters.lastValue });
  return formatRecordCode(kind, row.value);
}
