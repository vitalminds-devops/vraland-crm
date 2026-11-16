"use client";

import { Button } from "@/components/ui/button";

export default function Error({ retry }: { retry: () => void }) {
  return (
    <div className="grid min-h-96 place-items-center">
      <div className="text-center">
        <h2 className="font-semibold">The pipeline could not be loaded.</h2>
        <Button variant="secondary" className="mt-3" onClick={retry}>
          Try again
        </Button>
      </div>
    </div>
  );
}
