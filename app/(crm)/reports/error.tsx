"use client";

import { Button } from "@/components/ui/button";

export default function ReportsError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl p-8 text-center">
      <h2 className="text-xl font-semibold">Reports could not be loaded</h2>
      <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try again.</p>
      <Button type="button" className="mt-5" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
