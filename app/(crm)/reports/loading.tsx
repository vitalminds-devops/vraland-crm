import { PageContainer } from "@/components/common/page-container";
export default function ReportsLoading() {
  return (
    <PageContainer>
      <div className="h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      <div className="mt-8 h-24 animate-pulse rounded-xl bg-muted" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="mt-6 h-80 animate-pulse rounded-xl bg-muted" />
    </PageContainer>
  );
}
