import { notFound } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { RecordTable, RecordTd, RecordTh } from "@/components/common/record-table";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { TableBody, TableRow } from "@/components/ui/table";
import { EmptyCardState } from "@/features/contacts/components/empty-card-state";
import { formatDateTime } from "@/features/contacts/lib/helpers";
import { DeleteSequenceButton } from "@/features/marketing/components/delete-buttons";
import { EnrollmentForm } from "@/features/marketing/components/enrollment-form";
import { ExecuteStepButton } from "@/features/marketing/components/execute-step-button";
import {
  EnrollmentStatusBadge,
  RunStatusBadge,
  SequenceStatusBadge,
  StepActionLabel,
  TriggerBadge,
} from "@/features/marketing/components/marketing-badges";
import { MarketingNav } from "@/features/marketing/components/marketing-nav";
import {
  MarketingInfo,
  MarketingSection,
  MarketingStat,
} from "@/features/marketing/components/marketing-section";
import { StepForm } from "@/features/marketing/components/step-form";
import { waitLabel } from "@/features/marketing/lib/automation-timing";
import { triggerLabel } from "@/features/marketing/lib/marketing-meta";
import { OUTSIDE_ACCESS_LABEL } from "@/features/marketing/lib/recipient-privacy";
import { getMarketingOptions, getSequence } from "@/features/marketing/queries/marketing.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function SequencePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("marketing.view");
  const canSend = context.permissions.has("marketing.send");
  const canDelete = context.permissions.has("marketing.delete");
  const { id } = await params;
  const [data, options] = await Promise.all([getSequence(id), getMarketingOptions()]);
  if (!data) notFound();

  const sequence = data.record;
  const activeEnrollments = data.enrollments.filter(
    (enrollment) => enrollment.status === "active",
  ).length;

  return (
    <PageContainer>
      <PageHeader
        title={sequence.name}
        description={`${triggerLabel(sequence.triggerType)} · ${sequence.isActive ? "Active" : "Inactive"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BackButton fallbackHref="/marketing/automations" label="Back to follow-ups" />
            {canDelete ? <DeleteSequenceButton id={sequence.id} name={sequence.name} /> : null}
          </div>
        }
      />

      <MarketingNav current="/marketing/automations" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MarketingStat label="Steps" value={data.steps.length.toLocaleString()} />
        <MarketingStat label="People added" value={data.enrollments.length.toLocaleString()} />
        <MarketingStat label="Still in progress" value={activeEnrollments.toLocaleString()} />
        <MarketingStat label="Actions done" value={data.runTotal.toLocaleString()} />
      </div>

      <div
        className={
          data.canManage ? "mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" : "mt-6"
        }
      >
        <div className="space-y-6">
          <MarketingSection title="Overview">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {sequence.description?.trim() || "No description."}
            </p>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MarketingInfo
                label="Starts when"
                value={<TriggerBadge trigger={sequence.triggerType} />}
              />
              <MarketingInfo
                label="Status"
                value={<SequenceStatusBadge isActive={sequence.isActive} />}
              />
              <MarketingInfo label="Created" value={formatDateTime(sequence.createdAt)} />
              <MarketingInfo label="Updated" value={formatDateTime(sequence.updatedAt)} />
            </dl>
          </MarketingSection>

          <MarketingSection title="Steps" description="Run in order, top to bottom.">
            {data.steps.length ? (
              <ol className="space-y-3">
                {data.steps.map(({ step, emailTemplateName, smsTemplateName }) => {
                  return (
                    <li key={step.id} className="flex gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
                        {step.stepOrder}
                      </span>
                      <div className="min-w-0 flex-1 rounded-lg border border-border/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            <StepActionLabel action={step.actionType} />
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {step.delayMinutes > 0
                              ? `${waitLabel(step.delayMinutes)} after the step before`
                              : "Right after the step before"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {emailTemplateName ??
                            smsTemplateName ??
                            step.taskTitle ??
                            "No message configured"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyCardState
                message={
                  data.canManage
                    ? "No steps yet. Add the first message with “Add a step”."
                    : "No steps yet."
                }
              />
            )}
          </MarketingSection>

          <MarketingSection
            title="People in this follow-up"
            description="Steps don’t send by themselves yet: use “Do next step” for each person when it’s due."
          >
            {data.enrollments.length ? (
              <RecordTable
                head={
                  <TableRow>
                    <RecordTh>Person</RecordTh>
                    <RecordTh>Status</RecordTh>
                    <RecordTh className="hidden sm:table-cell">Steps done</RecordTh>
                    <RecordTh className="hidden md:table-cell">Added</RecordTh>
                    <RecordTh className="hidden lg:table-cell">Finished</RecordTh>
                    <RecordTh>
                      <span className="sr-only">Actions</span>
                    </RecordTh>
                  </TableRow>
                }
                footer={`${data.enrollments.length.toLocaleString()} people · ${activeEnrollments.toLocaleString()} in progress`}
              >
                <TableBody className="divide-y divide-border/40">
                  {data.enrollments.map((enrollment) => (
                    <TableRow key={enrollment.id} className="transition-colors hover:bg-muted/30">
                      <RecordTd className={enrollment.masked ? "text-muted-foreground" : undefined}>
                        {enrollment.masked
                          ? OUTSIDE_ACCESS_LABEL
                          : enrollment.contactName?.trim() || enrollment.dealTitle || "—"}
                      </RecordTd>
                      <RecordTd>
                        <EnrollmentStatusBadge status={enrollment.status} />
                      </RecordTd>
                      <RecordTd className="hidden text-xs tabular-nums sm:table-cell">
                        {enrollment.currentStepOrder ?? 0}
                      </RecordTd>
                      <RecordTd className="hidden text-xs text-muted-foreground md:table-cell">
                        {formatDateTime(enrollment.enrolledAt)}
                      </RecordTd>
                      <RecordTd className="hidden text-xs text-muted-foreground lg:table-cell">
                        {enrollment.completedAt ? formatDateTime(enrollment.completedAt) : "—"}
                      </RecordTd>
                      <RecordTd className="text-right">
                        {canSend && enrollment.status === "active" ? (
                          <ExecuteStepButton id={enrollment.id} />
                        ) : null}
                      </RecordTd>
                    </TableRow>
                  ))}
                </TableBody>
              </RecordTable>
            ) : (
              <EmptyCardState
                message={
                  sequence.triggerType === "manual"
                    ? "No one added yet. Add a person with “Add a person”."
                    : `No one yet. People are added when: ${triggerLabel(sequence.triggerType).toLowerCase()}.`
                }
              />
            )}
          </MarketingSection>

          <MarketingSection
            title="Activity"
            description="What this follow-up has done, newest first."
          >
            {data.runs.length ? (
              <RecordTable
                head={
                  <TableRow>
                    <RecordTh>Step</RecordTh>
                    <RecordTh>What happened</RecordTh>
                    <RecordTh>Status</RecordTh>
                    <RecordTh className="hidden md:table-cell">When</RecordTh>
                    <RecordTh className="hidden md:table-cell">Problem</RecordTh>
                  </TableRow>
                }
                footer={
                  data.runTotal > data.runs.length
                    ? `Showing the latest ${data.runs.length.toLocaleString()} of ${data.runTotal.toLocaleString()}.`
                    : `${data.runTotal.toLocaleString()} recorded.`
                }
              >
                <TableBody className="divide-y divide-border/40">
                  {data.runs.map((run) => {
                    return (
                      <TableRow key={run.id} className="transition-colors hover:bg-muted/30">
                        <RecordTd className="text-xs tabular-nums">{run.stepOrder ?? "—"}</RecordTd>
                        <RecordTd className="text-xs">
                          {run.actionType ? <StepActionLabel action={run.actionType} /> : "—"}
                        </RecordTd>
                        <RecordTd>
                          <RunStatusBadge status={run.status} />
                        </RecordTd>
                        <RecordTd className="hidden text-xs text-muted-foreground md:table-cell">
                          {run.executedAt
                            ? formatDateTime(run.executedAt)
                            : formatDateTime(run.createdAt)}
                        </RecordTd>
                        <RecordTd className="hidden max-w-56 truncate text-xs text-destructive md:table-cell">
                          {run.errorMessage ?? "—"}
                        </RecordTd>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </RecordTable>
            ) : (
              <EmptyCardState message="Nothing has happened yet." />
            )}
          </MarketingSection>
        </div>

        {data.canManage ? (
          <aside className="space-y-6">
            <StepForm sequenceId={sequence.id} options={options} />
            <EnrollmentForm sequenceId={sequence.id} options={options} />
          </aside>
        ) : null}
      </div>
    </PageContainer>
  );
}
