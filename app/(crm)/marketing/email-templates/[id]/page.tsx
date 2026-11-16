import { notFound } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { DotBadge } from "@/components/ui/dot-badge";
import { formatDateTime } from "@/features/contacts/lib/helpers";
import { DeleteTemplateButton } from "@/features/marketing/components/delete-buttons";
import { MarketingNav } from "@/features/marketing/components/marketing-nav";
import { MessagePreview } from "@/features/marketing/components/message-helpers";
import { MarketingInfo, MarketingSection } from "@/features/marketing/components/marketing-section";
import { TemplateToggle } from "@/features/marketing/components/template-toggle";
import { getEmailTemplate } from "@/features/marketing/queries/marketing.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function EmailTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("marketing.view");
  const canDelete = context.permissions.has("marketing.delete");
  const { id } = await params;
  const data = await getEmailTemplate(id);
  if (!data) notFound();
  const template = data.record;

  return (
    <PageContainer>
      <PageHeader
        title={template.name}
        description={`${template.subject} · ${template.category || "Uncategorized"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BackButton fallbackHref="/marketing/email-templates" label="Back to templates" />
            {data.canManage ? (
              <TemplateToggle
                type="email"
                id={template.id}
                name={template.name}
                active={template.isActive}
              />
            ) : null}
            {canDelete ? (
              <DeleteTemplateButton type="email" id={template.id} name={template.name} />
            ) : null}
          </div>
        }
      />

      <MarketingNav current="/marketing/email-templates" />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <MarketingSection title="Preview">
            <MessagePreview
              channel="email"
              subject={template.subject}
              body={
                template.bodyText ||
                template.bodyHtml
                  .replace(/<br\s*\/?>|<\/p>/gi, "\n")
                  .replace(/<[^>]*>/g, "")
                  .trim()
              }
            />
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted-foreground">HTML code</summary>
              <pre className="mt-2 max-h-[420px] overflow-auto rounded-lg border border-border/60 bg-muted/30 p-4 font-mono text-xs whitespace-pre-wrap">
                {template.bodyHtml}
              </pre>
            </details>
          </MarketingSection>
        </div>

        <MarketingSection title="Details">
          <dl className="grid gap-4">
            <MarketingInfo
              label="Status"
              value={
                <DotBadge tone={template.isActive ? "green" : "gray"}>
                  {template.isActive ? "Active" : "Inactive"}
                </DotBadge>
              }
            />
            <MarketingInfo label="Category" value={template.category || "Uncategorized"} />
            <MarketingInfo label="Subject" value={template.subject} />
            <MarketingInfo label="Created" value={formatDateTime(template.createdAt)} />
            <MarketingInfo label="Updated" value={formatDateTime(template.updatedAt)} />
          </dl>
        </MarketingSection>
      </div>
    </PageContainer>
  );
}
