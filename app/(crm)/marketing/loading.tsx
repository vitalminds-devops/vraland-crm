import { PageContainer } from "@/components/common/page-container";
import { MarketingHubSkeleton } from "@/features/marketing/components/marketing-skeletons";

export default function Loading() {
  return (
    <PageContainer>
      <MarketingHubSkeleton />
    </PageContainer>
  );
}
