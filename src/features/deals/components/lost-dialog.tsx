"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { markDealLost, type DealActionResult } from "../actions/deal.actions";

export type LostReason = { id: string; name: string };

/** Marking an opportunity Lost: a loss reason from Settings is required, notes are optional. */
export function LostDialog({
  dealId,
  dealTitle,
  reasons,
  onClose,
  onDone,
}: {
  dealId: string;
  dealTitle: string;
  reasons: LostReason[];
  onClose: () => void;
  /** The server's answer, so the caller can move the card or report an approval request. */
  onDone: (result: DealActionResult) => void;
}) {
  const [reasonId, setReasonId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <DialogPopup
            aria-describedby={undefined}
            className="w-full max-w-md rounded-xl border border-border/60 bg-card p-5 shadow-2xl"
          >
            <DialogTitle className="text-base font-semibold leading-tight">Mark lost</DialogTitle>
            <p className="mt-1 truncate text-[13px] text-muted-foreground">{dealTitle}</p>
            <form
              className="mt-5 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!reasonId) return;
                startTransition(async () => {
                  const result = await markDealLost({ dealId, lostReasonId: reasonId, notes });
                  if (!result.success) return setError(result.error.message);
                  onDone(result);
                });
              }}
            >
              <label className="grid gap-1.5 text-[13px] font-medium">
                Loss reason
                {reasons.length ? (
                  <NativeSelect
                    required
                    value={reasonId}
                    onChange={(event) => setReasonId(event.target.value)}
                    disabled={pending}
                  >
                    <NativeSelectOption value="" disabled>
                      Select a reason
                    </NativeSelectOption>
                    {reasons.map((reason) => (
                      <NativeSelectOption key={reason.id} value={reason.id}>
                        {reason.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : (
                  <span className="text-[13px] font-normal text-destructive">
                    No loss reasons are set up. Ask an administrator to add them.
                  </span>
                )}
              </label>
              <label className="grid gap-1.5 text-[13px] font-medium">
                Notes (optional)
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={2000}
                  disabled={pending}
                  className="resize-none"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={pending || !reasonId}
                >
                  {pending ? "Saving…" : "Mark lost"}
                </Button>
              </div>
            </form>
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
