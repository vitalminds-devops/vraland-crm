import { CheckCircle2, Circle, Edit3, FileText, KanbanSquare, UserRound } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";
import { BackButton } from "@/components/common/back-button";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { ButtonLink } from "@/components/ui/button";
import {
  EmptyCardState,
  InfoCard,
  NoteForm,
  cardClass,
  formatContactName,
  formatDateTime,
} from "@/features/contacts";
import {
  buildContactDetailGroups,
  buildEmploymentGroups,
  buildPurchasePreferenceGroups,
} from "@/features/contacts/lib/contact-detail-fields";
import { formatDate } from "@/features/contacts/lib/helpers";
import { label } from "@/features/properties/lib/helpers";
import { getContact } from "@/features/contacts/queries/contact.queries";
import { listContactRequirements } from "@/features/contacts/queries/requirement.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, context] = await Promise.all([
    getContact(id),
    requirePagePermission("contacts.view"),
  ]);
  if (!data) notFound();
  const canViewRequirements = context.permissions.has("requirements.view");
  const requirements = canViewRequirements ? await listContactRequirements(id) : [];
  const c = data.record;
  // updateContact and addContactNote both need contacts.update.
  const canUpdate = context.permissions.has("contacts.update");
  const editHref = canUpdate ? `/contacts/${id}/edit` : undefined;
  return (
    <PageContainer>
      <PageHeader
        title={formatContactName(c)}
        description={`Added ${formatDate(c.createdAt)}`}
        actions={
          <>
            <BackButton fallbackHref="/contacts" label="Back to contacts" />
            {editHref && (
              <ButtonLink href={editHref} variant="primary" className="gap-2">
                <Edit3 aria-hidden="true" className="size-4" />
                Edit
              </ButtonLink>
            )}
          </>
        }
      />
      {/* Below lg the columns stack: Overview first, then details and notes, Documents last. */}
      <div className="grid grid-cols-1 items-start gap-6 sm:mt-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <InfoCard
            title="Contact details"
            groups={buildContactDetailGroups(c)}
            editHref={editHref}
            emptyMessage="No details yet."
          />
          <InfoCard
            title="Property interest"
            groups={[...buildPurchasePreferenceGroups(c), ...buildEmploymentGroups(c)]}
            editHref={editHref}
            emptyMessage="No preferences yet."
          />
          <section className={cardClass}>
            <h2 className="border-b border-border/60 pb-3 text-[16px] font-semibold leading-none">
              Notes
            </h2>
            {canUpdate && (
              <div className="pt-4">
                <NoteForm contactId={id} />
              </div>
            )}
            <div className="mt-5 space-y-3">
              {c.notes && <p className="whitespace-pre-wrap text-sm text-foreground">{c.notes}</p>}
              {data.notes.map((n) => (
                <article key={n.id} className="rounded-lg bg-muted/60 p-3">
                  <p className="text-[15px] text-foreground">{n.note}</p>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    {n.authorFirstName || "System"} · {formatDateTime(n.createdAt)}
                  </p>
                </article>
              ))}
              {!c.notes && !data.notes.length && <EmptyCardState message="No notes yet." />}
            </div>
          </section>
        </div>
        <aside className="max-lg:contents lg:sticky lg:top-6 lg:space-y-6">
          <section className={cn(cardClass, "max-lg:order-first")}>
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
              <h2 className="text-[16px] font-semibold leading-none">Overview</h2>
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              <Fact icon={<UserRound />} label="Agent">
                {[c.assignedFirstName, c.assignedLastName].filter(Boolean).join(" ") || null}
              </Fact>
              <Fact icon={<KanbanSquare />} label="Pipeline stage">
                {data.deal?.stageName ?? "No opportunity"}
              </Fact>
              <Fact icon={<FileText />} label="Transaction type">
                {data.deal ? label(data.deal.dealType) : "No opportunity"}
              </Fact>
              <Fact icon={<CheckCircle2 />} label="Marketing consent">
                {c.marketingConsent ? "Agreed" : "Not agreed"}
              </Fact>
            </dl>
            <p className="mt-4 truncate border-t border-border/60 pt-3 font-mono text-[11px] text-muted-foreground">
              {c.contactCode}
            </p>
          </section>
          {canViewRequirements && (
            <section id="requirements" className={cn(cardClass, "max-lg:order-last")}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                <h2 className="text-[16px] font-semibold leading-none">
                  Documents
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {requirements.filter((r) => r.documentId).length}/{requirements.length}
                  </span>
                </h2>
                <ButtonLink
                  href={`/contacts/${id}/documents`}
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                >
                  <FileText aria-hidden="true" className="size-4" />
                  Manage documents
                </ButtonLink>
              </div>
              {requirements.length ? (
                <ul className="mt-4 grid gap-y-2.5">
                  {requirements.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-sm">
                      {r.documentId ? (
                        <CheckCircle2
                          aria-label="Submitted"
                          className="size-4 shrink-0 text-emerald-600"
                        />
                      ) : (
                        <Circle
                          aria-label="Not submitted"
                          className="size-4 shrink-0 text-muted-foreground/50"
                        />
                      )}
                      <span className={r.documentId ? "" : "text-muted-foreground"}>{r.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4">
                  <EmptyCardState message="No documents yet." />
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </PageContainer>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">
        {children || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
