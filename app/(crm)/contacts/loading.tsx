export default function ContactsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading contacts">
      <div className="h-9 w-56 animate-pulse rounded-md bg-muted/70" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl bg-muted/40 p-5">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-7 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="space-y-4 rounded-xl bg-muted/30 p-5">
        <div className="h-9 w-full animate-pulse rounded-md bg-muted/70" />
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-10 w-full animate-pulse rounded-md bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
