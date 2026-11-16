import { notFound } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { DotBadge } from "@/components/ui/dot-badge";
import { formatDateTime } from "@/features/contacts/lib/helpers";
import { DeleteTemplateButton } from "@/features/marketing/components/delete-buttons";
import { MarketingNav } from "@/features/marketing/components/marketing-nav";
import { SAMPLE_FIRST_NAME, render } from "@/features/marketing/lib/merge-fields";
import { MarketingInfo, MarketingSection } from "@/features/marketing/components/marketing-section";
import { TemplateToggle } from "@/features/marketing/components/template-toggle";
import { getSmsTemplate } from "@/features/marketing/queries/marketing.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

const SMS_SEGMENT = 160;

export default async function SmsTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("marketing.view");
  const canDelete = context.permissions.has("marketing.delete");
  const { id } = await params;
  const data = await getSmsTemplate(id);
  if (!data) notFound();
  const template = data.record;
  const segments = Math.max(1, Math.ceil(template.body.length / SMS_SEGMENT));

  return (
    <PageContainer>
      <PageHeader
        title={template.name}
        description={`${template.category || "Uncategorized"} · ${template.body.length.toLocaleString()} characters`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BackButton fallbackHref="/marketing/sms-templates" label="Back to templates" />
            {data.canManage ? (
              <TemplateToggle
                type="sms"
                id={template.id}
                name={template.name}
                active={template.isActive}
              />
            ) : null}
            {canDelete ? (
              <DeleteTemplateButton type="sms" id={template.id} name={template.name} />
            ) : null}
          </div>
        }
      />

      <MarketingNav current="/marketing/sms-templates" />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <MarketingSection title="Preview">
          <div className="mx-auto max-w-md">
            <div className="rounded-xl rounded-bl-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm">
              {render(template.body, SAMPLE_FIRST_NAME)}
            </div>
            <p className="mt-2 text-right text-[11px] tabular-nums text-muted-foreground">
              Shown for {SAMPLE_FIRST_NAME} · {template.body.length.toLocaleString()} characters ·
              sent as {segments} SMS
            </p>
          </div>
        </MarketingSection>

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
            <MarketingInfo label="Created" value={formatDateTime(template.createdAt)} />
            <MarketingInfo label="Updated" value={formatDateTime(template.updatedAt)} />
          </dl>
        </MarketingSection>
      </div>
    </PageContainer>
  );
}
