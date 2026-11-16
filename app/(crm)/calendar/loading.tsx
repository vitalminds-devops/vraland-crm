import { PageContainer } from "@/components/common/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageContainer>
      <div className="flex items-center justify-end gap-2 pb-6">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-36" />
      </div>

      <Skeleton className="mb-4 h-4 w-64" />

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 p-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="ml-1 h-6 w-36" />
          </div>
          <div className="hidden gap-1 md:flex">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-8 w-56" />
        </div>

        <div className="grid grid-cols-7 border-b border-border/50 bg-muted/40">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="px-2 py-2">
              <Skeleton className="mx-auto h-3 w-8" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[120px] space-y-1.5 border-b border-r border-border/40 p-1.5"
            >
              <Skeleton className="size-6 rounded-full" />
              {i % 3 === 0 ? <Skeleton className="h-4 w-full" /> : null}
              {i % 5 === 0 ? <Skeleton className="h-4 w-3/4" /> : null}
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
