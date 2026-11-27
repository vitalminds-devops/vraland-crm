"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";

import { recalculateCommission } from "../actions/deal-commission.actions";

/** Redoes a won opportunity's commission by today's rules, after a confirm. */
export function RecalculateCommissionButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function recalculate() {
    startTransition(async () => {
      const result = await recalculateCommission({ dealId });
      notify(
        result.success ? result.data.message : result.error.message,
        result.success ? "success" : "error",
      );
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="-my-1 h-7 gap-1.5 px-2 text-xs">
          <RefreshCw aria-hidden="true" className="size-3.5" />
          Recalculate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>Recalculate commission</DialogTitle>
        <DialogDescription>
          Replaces it with today&apos;s commission rules for the current agent and broker.
        </DialogDescription>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={recalculate}>
            {pending ? "Recalculating…" : "Recalculate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
