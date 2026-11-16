import { PageContainer } from "@/components/common/page-container";

export default function DashboardLoading() {
  const panel = "animate-pulse rounded-xl border border-border bg-card";
  return (
    <PageContainer>
      <div className="space-y-6" aria-busy="true">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-muted/50" />
        </div>

        <div className={`${panel} h-72`} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={`${panel} h-32`} />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
          <div className={`${panel} h-80`} />
          <div className={`${panel} h-80`} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={`${panel} h-64`} />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
