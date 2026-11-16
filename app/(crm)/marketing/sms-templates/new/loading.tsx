import { PageContainer } from "@/components/common/page-container";
import { MarketingFormSkeleton } from "@/features/marketing/components/marketing-skeletons";

export default function Loading() {
  return (
    <PageContainer className="max-w-7xl">
      <MarketingFormSkeleton />
    </PageContainer>
  );
}
