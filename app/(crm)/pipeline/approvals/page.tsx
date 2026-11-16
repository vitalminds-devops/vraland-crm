import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { PendingApprovals } from "@/features/deals/components/pending-approvals";
import { getPendingStageApprovals } from "@/features/deals/queries/deal.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function StageApprovalsPage() {
  await requirePagePermission("deals.approve_stage_change");
  const items = await getPendingStageApprovals();
  return (
    <PageContainer>
      <PageHeader
        title="Stage approvals"
        description="Stage changes waiting for sign-off."
        actions={<BackButton fallbackHref="/pipeline" label="Back to pipeline" />}
      />
      <section className="mt-6 rounded-xl border bg-card p-5">
        <PendingApprovals items={items} />
      </section>
    </PageContainer>
  );
}
