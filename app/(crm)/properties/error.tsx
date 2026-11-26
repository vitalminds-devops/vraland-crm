"use client";
import { Button } from "@/components/ui/button";
export default function PropertiesError({ retry }: { retry: () => void }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-border/50 bg-card p-8 text-center shadow-xs dark:shadow-none">
      <h2 className="text-lg font-semibold">Couldn’t load properties</h2>
      <Button variant="secondary" className="mt-5" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
