import Link from "next/link";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { DocumentPreview } from "@/features/documents/components/document-preview";
import { getDocument } from "@/features/documents/queries/document.queries";
import { formatContactName } from "@/features/contacts/lib/helpers";
import { documentTypeLabel } from "@/features/contacts/lib/contact-options";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { fileKind, size } from "../page";
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePagePermission("documents.view");
  const data = await getDocument(id);
  if (!data) notFound();
  const d = data.document;
  return (
    <PageContainer>
      <PageHeader
        title={d.name}
        description={documentTypeLabel(d.documentType)}
        actions={
          <>
            <BackButton fallbackHref="/documents" label="Back to documents" />
            <a
              href={`/api/documents/${id}/download`}
              className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
            >
              <Download className="size-4" />
              Download
            </a>
          </>
        }
      />
      <div className="mt-6">
        <main className="space-y-6">
          <Section title="Document preview">
            <DocumentPreview key={id} id={id} name={d.name} mimeType={d.mimeType} />
          </Section>
          <Section title="Document information">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="File type" value={fileKind(d.mimeType)} />
              <Info label="Size" value={size(d.fileSizeBytes)} />
              <Info label="Created" value={d.createdAt.toLocaleString()} />
            </dl>
            <h3 className="mt-5 border-t border-border/60 pt-4 text-sm font-medium text-muted-foreground">
              Related records
            </h3>
            <div className="mt-3 flex flex-wrap gap-3">
              {d.contactId && (
                <Link
                  href={`/contacts/${d.contactId}`}
                  className="rounded border px-3 py-2 text-sm"
                >
                  {formatContactName({
                    firstName: data.contactFirstName,
                    middleName: data.contactMiddleName,
                    lastName: data.contactLastName,
                  })}
                </Link>
              )}
              {d.propertyId && (
                <Link
                  href={`/properties/buildings/${d.propertyId}`}
                  className="rounded border px-3 py-2 text-sm"
                >
                  {data.propertyTitle}
                </Link>
              )}
              {d.dealId && (
                <Link href={`/deals/${d.dealId}`} className="rounded border px-3 py-2 text-sm">
                  {data.dealTitle}
                </Link>
              )}
              {!d.contactId && !d.propertyId && !d.dealId && (
                <p className="text-sm text-muted-foreground">No CRM record connected.</p>
              )}
            </div>
          </Section>
        </main>
      </div>
    </PageContainer>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Info({ label: caption, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{caption}</dt>
      <dd className="mt-1 break-all text-sm">{value || "—"}</dd>
    </div>
  );
}
