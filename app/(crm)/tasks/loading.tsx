import { PageContainer } from "@/components/common/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageContainer>
      <div aria-busy="true" aria-label="Loading tasks" className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-1 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
          <Skeleton className="h-9 w-28" />
        </div>

        <Skeleton className="h-10 w-56 rounded-xl" />

        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-[118px] rounded-xl" />
          ))}
        </div>

        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-full max-w-sm" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-36" />
          </div>
          <div className="mt-6 space-y-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden h-4 w-28 sm:block" />
                <Skeleton className="hidden h-6 w-20 md:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
