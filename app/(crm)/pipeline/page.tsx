import { ShieldCheck } from "lucide-react";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { ButtonLink } from "@/components/ui/button";
import { PipelineBoard } from "@/features/deals/components/pipeline-board";
import { getPipelineBoard } from "@/features/deals/queries/deal.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityDraft?: string }>;
}) {
  await requirePagePermission("deals.view");
  const data = await getPipelineBoard();
  const { opportunityDraft } = await searchParams;
  const awaitingApproval = data.deals.filter((deal) => deal.pendingApprovalStage).length;
  return (
    <PageContainer>
      <PageHeader
        title="Sales pipeline"
        description="Your sales stages"
        actions={
          data.canApproveStageChange && (
            <ButtonLink href="/pipeline/approvals" variant="secondary" className="gap-2">
              <ShieldCheck className="size-4" />
              Approvals{awaitingApproval ? ` (${awaitingApproval})` : ""}
            </ButtonLink>
          )
        }
      />
      <div className="mt-6">
        {data.stages.length ? (
          <PipelineBoard
            resumeOpportunityId={opportunityDraft}
            stages={data.stages}
            deals={data.deals}
            canChangeStage={data.canChangeStage}
            canApproveStageChange={data.canApproveStageChange}
            canMoveBack={data.canMoveBack}
            userRole={data.userRole}
          />
        ) : (
          <div className="grid min-h-64 place-items-center rounded-xl border bg-card text-sm text-muted-foreground">
            No active pipeline stages are configured.
          </div>
        )}
      </div>
    </PageContainer>
  );
}
