import { PageContainer } from "@/components/common/page-container";
import { MarketingDetailSkeleton } from "@/features/marketing/components/marketing-skeletons";

export default function Loading() {
  return (
    <PageContainer>
      <MarketingDetailSkeleton />
    </PageContainer>
  );
}
