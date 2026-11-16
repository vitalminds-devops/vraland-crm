import { PageContainer } from "@/components/common/page-container";

export default function PropertiesLoading() {
  return (
    <PageContainer>
      <div className="space-y-6" aria-busy="true">
        <div className="h-9 w-56 animate-pulse rounded bg-muted/70" />
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
          <div className="h-[58px] animate-pulse border-b border-border/40 bg-muted/30" />
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
