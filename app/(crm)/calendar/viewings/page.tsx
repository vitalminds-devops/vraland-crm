import Link from "next/link";
import { BackButton } from "@/components/common/back-button";
import { FilterForm } from "@/components/common/filter-form";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ViewingForm } from "@/features/calendar/components/viewing-form";
import { ViewingStatus } from "@/features/calendar/components/viewing-status";
import { VIEWING_STATUS_LABELS } from "@/features/calendar/lib/viewing-status";
import { getCalendarOptions, listViewings } from "@/features/calendar/queries/calendar.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { canEditViewing, type ViewingReference } from "@/lib/permissions/viewings";
import { manilaDateTime } from "@/lib/utils/manila-time";
export default async function ViewingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; when?: string }>;
}) {
  const context = await requirePagePermission("calendar.view");
  const q = await searchParams;
  const [rows, options] = await Promise.all([
    // Recent and upcoming by default, so the page doesn't load every viewing ever held.
    listViewings({ status: q.status, recent: q.when !== "all" }),
    getCalendarOptions(),
  ]);
  const canAssign = context.permissions.has("calendar.assign_viewings");

  // Check edit permissions for each viewing
  const editableViewings = new Set<string>();
  for (const v of rows) {
    const viewingRef: ViewingReference = {
      id: v.id,
      organizationId: context.organizationId,
      agentUserId: v.agentUserId,
      eventCreatedBy: v.createdBy,
      contactId: v.contactId,
      propertyId: v.propertyId,
      dealId: v.dealId,
    };
    if (canEditViewing(context, viewingRef)) {
      editableViewings.add(v.id);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Property viewings"
        description="Property viewings and their outcomes."
        actions={
          <>
            <BackButton fallbackHref="/calendar" label="Back to calendar" />
            {context.permissions.has("calendar.schedule_viewings") ? (
              <ViewingForm options={options} canAssign={canAssign} currentUserId={context.userId} />
            ) : undefined}
          </>
        }
      />
      <div className="mt-6 rounded-xl border bg-card">
        <FilterForm className="flex gap-2 border-b p-4">
          <NativeSelect
            name="status"
            aria-label="Status"
            defaultValue={q.status}
            className="rounded-md border bg-background px-3 py-2 pr-9 text-sm"
            wrapperClassName="w-full sm:w-52"
          >
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            {Object.entries(VIEWING_STATUS_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            name="when"
            aria-label="When"
            defaultValue={q.when}
            className="rounded-md border bg-background px-3 py-2 pr-9 text-sm"
            wrapperClassName="w-full sm:w-52"
          >
            <NativeSelectOption value="">Last 30 days and upcoming</NativeSelectOption>
            <NativeSelectOption value="all">All time</NativeSelectOption>
          </NativeSelect>
        </FilterForm>
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((v) => (
            <article key={v.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    href={`/properties/${v.propertyId}`}
                    className="font-medium hover:underline"
                  >
                    {v.propertyTitle}
                  </Link>
                  <p className="text-xs text-muted-foreground">{v.propertyCode}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs">
                  {VIEWING_STATUS_LABELS[v.status] ?? v.status}
                </span>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <Info label="Contact" value={`${v.contactFirstName} ${v.contactLastName}`} />
                <Info
                  label="Schedule"
                  value={`${manilaDateTime(v.startAt)} – ${v.endAt.toLocaleTimeString("en-US", { timeZone: "Asia/Manila", timeStyle: "short" })}`}
                />
                <Info
                  label="Agent"
                  value={v.agentFirstName ? `${v.agentFirstName} ${v.agentLastName}` : "Unassigned"}
                />
                <Info label="Location" value={v.location} />
                <Info label="Interest" value={v.interestLevel ? `${v.interestLevel} / 5` : null} />
              </dl>
              {v.feedback && (
                <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{v.feedback}</p>
              )}
              {editableViewings.has(v.id) && (
                <ViewingStatus
                  id={v.id}
                  status={v.status}
                  feedback={v.feedback}
                  interestLevel={v.interestLevel}
                />
              )}
            </article>
          ))}
          {!rows.length && (
            <p className="col-span-full p-12 text-center text-sm text-muted-foreground">
              No viewings match this status.
            </p>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value || "—"}</dd>
    </div>
  );
}
