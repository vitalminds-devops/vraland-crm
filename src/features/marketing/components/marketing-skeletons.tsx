import { Skeleton } from "@/components/ui/skeleton";

function LoadingLabel({ label }: { label: string }) {
  return <span className="sr-only">{label}</span>;
}

export function MarketingHubSkeleton() {
  return (
    <div aria-busy="true" className="mt-6">
      <LoadingLabel label="Loading marketing overview" />
      <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="mt-6 space-y-6">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-xl lg:col-span-2" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}

export function MarketingListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="mt-6">
      <LoadingLabel label="Loading marketing records" />
      <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
      <div className="mt-6 overflow-hidden rounded-xl border border-border/50 bg-card">
        <div className="flex flex-wrap gap-3 border-b border-border/40 p-4">
          <Skeleton className="h-9 flex-1 min-w-full sm:min-w-[220px] rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
        <div className="divide-y divide-border/40">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="ml-auto h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MarketingDetailSkeleton() {
  return (
    <div aria-busy="true" className="mt-6">
      <LoadingLabel label="Loading marketing record" />
      <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
      <div className="mt-6 grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}

export function MarketingFormSkeleton() {
  return (
    <div aria-busy="true" className="mt-6 flex gap-8">
      <LoadingLabel label="Loading form" />
      <Skeleton className="hidden h-64 w-52 shrink-0 rounded-xl lg:block" />
      <Skeleton className="h-[32rem] min-w-0 flex-1 rounded-[14px]" />
    </div>
  );
}
