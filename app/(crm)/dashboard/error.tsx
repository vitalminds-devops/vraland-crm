"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-border/50 bg-card p-8 text-center shadow-xs dark:shadow-none">
      <span className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle aria-hidden="true" className="size-5" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">Dashboard data is unavailable</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        Something went wrong. Try again.
      </p>
      <Button variant="secondary" className="mt-5" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
