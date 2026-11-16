import { PageContainer } from "@/components/common/page-container";
import { MarketingListSkeleton } from "@/features/marketing/components/marketing-skeletons";

export default function Loading() {
  return (
    <PageContainer>
      <MarketingListSkeleton />
    </PageContainer>
  );
}
