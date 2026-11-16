import { PageContainer } from "@/components/common/page-container";
export default function Loading() {
  return (
    <PageContainer>
      <div className="h-10 w-56 animate-pulse rounded bg-muted" />
      <div className="mt-8 h-96 animate-pulse rounded-xl bg-muted" />
    </PageContainer>
  );
}
