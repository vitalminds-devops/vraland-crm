import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Building2, Car } from "lucide-react";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { RecordTable, RecordTd, RecordTh } from "@/components/common/record-table";
import { TableBody, TableRow } from "@/components/ui/table";
import { EmptyCardState, formatContactName, cardClass } from "@/features/contacts";
import { DealActions } from "@/features/deals/components/deal-actions";
import { ReassignAgentButton } from "@/features/deals/components/reassign-agent-button";
import {
  AddOpportunityButton,
  ChangeUnitsButton,
} from "@/features/deals/components/opportunity-units";
import { unitStatusLabel, unitStatusToneFor } from "@/features/properties/lib/unit-codes";
import { getDeal, getDealOptions } from "@/features/deals/queries/deal.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

const headClass = "border-b border-border/60 pb-3 text-[16px] font-semibold leading-none";

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ opportunityDraft?: string }>;
}) {
  const { id } = await params;
  await requirePagePermission("deals.view");
  const [data, options] = await Promise.all([getDeal(id), getDealOptions()]);
  if (!data) notFound();
  const d = data.deal;
  const { opportunityDraft } = await searchParams;

  const activity = data.activities.filter((a) => a.activityType !== "deal.stage_changed");
  const hiddenActivity = data.activities.length - activity.length;

  return (
    <PageContainer>
      <PageHeader
        title={d.title}
        description={`${d.dealCode} · ${data.stageName} · ${label(d.status)}`}
        actions={
          <>
            <BackButton fallbackHref="/pipeline" label="Back to pipeline" />
            {data.canReassignAgent && (
              <ReassignAgentButton
                dealId={id}
                currentAgentId={d.primaryAgentUserId}
                agents={options.agents}
              />
            )}
            {data.canUpdate || data.canChangeStage || data.canDelete ? (
              <DealActions
                resumeOpportunityId={opportunityDraft}
                dealId={id}
                dealTitle={d.title}
                currentStageId={d.stageId}
                reservationPaid={data.reservationPaid}
                firstMonthPaid={data.firstMonthPaid}
                stages={options.stages}
                canChangeStage={data.canChangeStage}
                canDelete={data.canDelete}
                canApproveStageChange={data.canApproveStageChange}
                canMoveBack={data.canMoveBack}
                userRole={data.userRole}
              />
            ) : undefined}
          </>
        }
      />
      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Section
            title="Units"
            action={
              <div className="flex flex-wrap gap-2">
                {data.canChangeStage && data.stageSlug !== "leads" && !data.stageClosed && (
                  <ChangeUnitsButton dealId={id} />
                )}
                {data.canCreate && data.contacts.length > 0 && data.stageSlug !== "leads" && (
                  <AddOpportunityButton dealId={id} />
                )}
              </div>
            }
          >
            {data.units.length ? (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 aria-hidden="true" className="size-4" />
                  {[data.developmentName, data.propertyTitle].filter(Boolean).join(" · ")}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {data.units.map((unit) => (
                    <li
                      key={unit.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${unitStatusToneFor(unit.status)}`}
                    >
                      <p className="font-semibold">Unit {unit.code}</p>
                      <p className="text-xs opacity-80">
                        {[unit.floorLabel, unitStatusLabel(unit.status)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                  {data.parking.map((slot) => (
                    <li
                      key={slot.id}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm"
                    >
                      <Car aria-hidden="true" className="size-4 text-muted-foreground" />
                      <span className="font-medium">{slot.code}</span>
                    </li>
                  ))}
                </ul>
                {d.parkingSlots > 0 && d.parkingAmount && (
                  <p className="text-xs text-muted-foreground">
                    Parking {money(d.parkingAmount, d.currency)}
                  </p>
                )}
              </div>
            ) : (
              <EmptyCardState
                message={
                  data.stageSlug === "leads"
                    ? "Units are picked when this lead moves to Opportunity."
                    : "No units selected."
                }
              />
            )}
          </Section>

          <Section title="Summary">
            <dl className="grid gap-3 sm:grid-cols-3">
              <Stat label="Value" value={money(d.amount, d.currency)} />
              <Stat label="Expected commission" value={money(d.expectedCommission, d.currency)} />
              <Stat label="Probability" value={`${d.probability}%`} />
            </dl>
            <dl className="mt-5 grid gap-x-6 gap-y-5 border-t border-border/60 pt-5 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Expected close" value={date(d.expectedCloseDate)} />
              <Info label="Actual close" value={date(d.actualCloseDate)} />
              <Info label="Type" value={label(d.dealType)} />
              <Info label="Primary agent" value={person(data.agentFirstName, data.agentLastName)} />
              <Info label="Broker" value={person(data.brokerFirstName, data.brokerLastName)} />
              {data.lostReasonName && <Info label="Loss reason" value={data.lostReasonName} />}
            </dl>
            {d.lostNotes && (
              <p className="mt-5 border-t border-border/60 pt-4 text-sm text-muted-foreground">
                {d.lostNotes}
              </p>
            )}
          </Section>

          {/* Offers are no longer recorded here; older ones stay visible. */}
          {data.offers.length > 0 && (
            <Section title="Offers">
              {data.offers.length ? (
                <ul className="space-y-3">
                  {data.offers.map((v) => (
                    <li key={v.id} className="rounded-lg border border-border/60 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">{money(v.amount, v.currency)}</p>
                          <p className="text-xs text-muted-foreground">
                            {person(v.firstName, v.lastName) ?? "No contact attached"} ·{" "}
                            {label(v.status)}
                          </p>
                        </div>
                        <p className="whitespace-nowrap text-xs text-muted-foreground">
                          {v.submittedAt ? formatDateTime(v.submittedAt) : "Not submitted"}
                        </p>
                      </div>
                      {v.terms && <p className="mt-2 text-sm text-muted-foreground">{v.terms}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyCardState message="No offers yet." />
              )}
            </Section>
          )}

          <Section title="Stage history">
            {data.history.length ? (
              <RecordTable
                head={
                  <TableRow>
                    <RecordTh className="whitespace-nowrap">When</RecordTh>
                    <RecordTh>Change</RecordTh>
                    <RecordTh className="hidden sm:table-cell">Changed by</RecordTh>
                    <RecordTh>Reason</RecordTh>
                  </TableRow>
                }
                footer={`${data.history.length} stage ${data.history.length === 1 ? "change" : "changes"}`}
              >
                <TableBody className="divide-y divide-border/40">
                  {data.history.map((v) => (
                    <TableRow key={v.id} className="align-top">
                      <RecordTd className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(v.changedAt)}
                      </RecordTd>
                      <RecordTd>
                        <span className="flex items-center gap-1.5">
                          {v.fromName && (
                            <>
                              <span className="text-muted-foreground">{v.fromName}</span>
                              <ArrowRight
                                aria-hidden="true"
                                className="size-3.5 shrink-0 text-muted-foreground"
                              />
                            </>
                          )}
                          <span className="font-medium">{v.toName}</span>
                        </span>
                      </RecordTd>
                      <RecordTd className="hidden text-muted-foreground sm:table-cell">
                        {person(v.firstName, v.lastName) ?? "System"}
                      </RecordTd>
                      <RecordTd className="text-muted-foreground">{v.note || "—"}</RecordTd>
                    </TableRow>
                  ))}
                </TableBody>
              </RecordTable>
            ) : (
              <EmptyCardState message="No stage changes yet." />
            )}
          </Section>

          <Section title="Activity">
            {activity.length ? (
              <RecordTable
                head={
                  <TableRow>
                    <RecordTh>Event</RecordTh>
                    <RecordTh className="w-44 whitespace-nowrap">When</RecordTh>
                  </TableRow>
                }
                footer={
                  <>
                    {activity.length} {activity.length === 1 ? "entry" : "entries"}
                    {hiddenActivity > 0 && (
                      <>
                        {" · "}
                        {hiddenActivity} stage change
                        {hiddenActivity === 1 ? "" : "s"} shown under{" "}
                        <strong className="font-medium">Stage history</strong> above
                      </>
                    )}
                  </>
                }
              >
                <TableBody className="divide-y divide-border/40">
                  {activity.map((v) => (
                    <TableRow key={v.id} className="align-top">
                      <RecordTd>{v.summary}</RecordTd>
                      <RecordTd className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(v.createdAt)}
                      </RecordTd>
                    </TableRow>
                  ))}
                </TableBody>
              </RecordTable>
            ) : (
              <EmptyCardState message="No activity yet." />
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Contacts">
            {data.contacts.length ? (
              <ul className="space-y-2">
                {data.contacts.map((v) => (
                  <li key={`${v.id}-${v.role}`}>
                    <Link
                      href={`/contacts/${v.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-[13px] transition-colors hover:bg-muted/60"
                    >
                      <span className="truncate font-medium">{formatContactName(v)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {label(v.role)}
                        {v.isPrimary ? " · Primary" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyCardState message="No contacts yet." />
            )}
          </Section>

          <Section title="Agents">
            {data.agents.length ? (
              <ul className="space-y-3">
                {data.agents.map((v) => (
                  <li key={v.id} className="text-sm">
                    <p className="font-medium">{person(v.firstName, v.lastName)}</p>
                    <p className="text-xs text-muted-foreground">
                      {label(v.role)}
                      {v.split ? ` · ${v.split}% split` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyCardState message="No agents yet." />
            )}
          </Section>

          {d.status === "won" && (
            <Section title="Commission">
              {data.commissions.length ? (
                <ul className="space-y-3">
                  {data.commissions.map((v) => (
                    <li key={v.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium">{person(v.firstName, v.lastName)}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.roleName} · {Number(v.rate)}%
                        </p>
                      </div>
                      <p className="font-semibold tabular-nums">{money(v.amount, d.currency)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyCardState message="No commission set." />
              )}
            </Section>
          )}

          <Section title="Tasks">
            {data.tasks.length ? (
              <ul className="space-y-3">
                {data.tasks.map((v) => (
                  <li key={v.id} className="text-sm">
                    <p className="font-medium">{v.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {label(v.status)} · {v.dueAt ? formatDateTime(v.dueAt) : "No due date"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyCardState message="No tasks yet." />
            )}
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={cardClass}>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${headClass}`}>
        <h2>{title}</h2>
        {action}
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function Info({ label: caption, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{caption}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}

function Stat({ label: caption, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{caption}</dt>
      <dd className="mt-1 text-xl font-semibold leading-tight tracking-tight tabular-nums">
        {value || <span className="font-normal text-muted-foreground/60">—</span>}
      </dd>
    </div>
  );
}

/** "First Last", or `null` when no one is named, so callers can fall back. */
function person(first: string | null, last: string | null): string | null {
  const name = `${first ?? ""} ${last ?? ""}`.trim();
  return name || null;
}

/** The one date-time format used on this page. */
function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

function date(value: string | null): string | null {
  return value
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(value))
    : null;
}

const label = (v: string) => v.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

const money = (v: string | null, c: string) =>
  v
    ? new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: c,
      }).format(Number(v))
    : null;
