"use client";

import { AlertTriangle } from "lucide-react";
import { PageContainer } from "@/components/common/page-container";
import { Button } from "@/components/ui/button";

export default function Error({ retry }: { retry: () => void }) {
  return (
    <PageContainer>
      <div className="grid min-h-96 place-items-center text-center">
        <div className="max-w-md rounded-xl border border-border/50 bg-card p-8 shadow-xs dark:shadow-none">
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle aria-hidden="true" className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Couldn’t load tasks</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Something went wrong. Try again.
          </p>
          <Button variant="secondary" className="mt-4" onClick={retry}>
            Try again
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
