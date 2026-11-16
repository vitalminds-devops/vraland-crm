import { PageContainer } from "@/components/common/page-container";
export default function Loading() {
  return (
    <PageContainer>
      <div className="h-9 w-56 animate-pulse rounded bg-muted" />
      <div className="mt-8 flex gap-4 overflow-hidden">
        {[1, 2, 3, 4].map((v) => (
          <div key={v} className="h-[480px] w-[300px] shrink-0 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </PageContainer>
  );
}
