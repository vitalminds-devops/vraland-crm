import { redirect } from "next/navigation";

import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import {
  AuditLogWorkspace,
  type AuditRow,
} from "@/features/settings/components/audit-log-workspace";
import { SettingsNav } from "@/features/settings/components/settings-nav";
import { formatDateTime } from "@/features/contacts/lib/helpers";
import {
  AUDIT_PAGE_SIZES,
  isAuditPageSize,
  listAuditLogs,
} from "@/features/settings/queries/audit.queries";
import {
  auditFieldLabel,
  auditRecordName,
  changedAuditFields,
  formatAuditValue,
} from "@/features/settings/lib/audit-labels";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { canViewAuditLog } from "@/lib/permissions/policy";

export const metadata = { title: "Logs" };

type AuditSearchParams = {
  page?: string;
  pageSize?: string;
  search?: string;
  action?: string;
  entity?: string;
  actor?: string;
  from?: string;
  to?: string;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<AuditSearchParams>;
}) {
  const context = await requirePagePermission("settings.audit");
  if (!canViewAuditLog(context)) redirect("/forbidden");

  const query = await searchParams;
  const pageSize = Number.parseInt(query.pageSize ?? "", 10);
  const data = await listAuditLogs({
    page: positiveInteger(query.page, 1),
    pageSize: isAuditPageSize(pageSize) ? pageSize : undefined,
    search: query.search,
    action: query.action || undefined,
    entityType: query.entity || undefined,
    actorUserId: query.actor || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
  });

  const rows: AuditRow[] = data.rows.map((row) => {
    const fields = changedAuditFields(row.oldValues, row.newValues);
    const labels = fields.map(auditFieldLabel);
    const shown = labels.slice(0, 4);
    const before = isRecord(row.oldValues) ? row.oldValues : {};
    const after = isRecord(row.newValues) ? row.newValues : {};
    return {
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorName:
        [row.actorFirstName, row.actorLastName].filter(Boolean).join(" ") ||
        row.actorEmail ||
        "System",
      actorEmail: row.actorEmail,
      occurredAt: formatDateTime(row.occurredAt),
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      recordName: auditRecordName(row.oldValues, row.newValues),
      changedFields: labels.length
        ? `${shown.join(", ")}${labels.length > shown.length ? ` +${labels.length - shown.length} more` : ""}`
        : "—",
      changes: fields.map((field, index) => ({
        field: labels[index],
        before: field in before ? formatAuditValue(before[field], formatDateTime) : null,
        after: field in after ? formatAuditValue(after[field], formatDateTime) : null,
      })),
    };
  });

  return (
    <PageContainer>
      <PageHeader title="Logs" description="Who changed what, and when." />
      <SettingsNav permissions={context.permissions} current="/settings/logs" />
      <AuditLogWorkspace
        rows={rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        pageCount={data.pageCount}
        filters={{
          search: query.search ?? "",
          action: query.action ?? "",
          entityType: query.entity ?? "",
          actorUserId: query.actor ?? "",
          from: query.from ?? "",
          to: query.to ?? "",
        }}
        actions={data.facets.actions}
        entityTypes={data.facets.entityTypes}
        actors={data.facets.actors}
        pageSizes={AUDIT_PAGE_SIZES}
      />
    </PageContainer>
  );
}
