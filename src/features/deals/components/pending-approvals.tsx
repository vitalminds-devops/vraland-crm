"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { approveStageChange, rejectStageChange } from "@/features/deals/actions/deal.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/toast";

type Approval = {
  id: string;
  dealId: string;
  dealTitle: string;
  fromStageName: string | null;
  toStageName: string;
  reason: string | null;
  requesterFirstName: string | null;
  requesterLastName: string | null;
};

export function PendingApprovals({ items }: { items: Approval[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function decide(action: "approve" | "reject", approval: Approval, note: string) {
    setBusyId(approval.id);
    startTransition(async () => {
      const result =
        action === "approve"
          ? await approveStageChange({ requestId: approval.id, note })
          : await rejectStageChange({ requestId: approval.id, note });
      notify(
        result.success
          ? action === "approve"
            ? `${approval.dealTitle} was moved to ${approval.toStageName}.`
            : `${approval.dealTitle} was left in place.`
          : result.error.message || "Couldn't save. Try again.",
        result.success ? "success" : "error",
      );
      setBusyId(null);
    });
  }

  if (!items.length)
    return (
      <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-border/60 bg-muted/20 px-5 text-center text-sm text-muted-foreground">
        Nothing to approve.
      </div>
    );

  return (
    <div>
      <ul className="flex flex-col divide-y divide-border/60">
        {items.map((approval) => (
          <li key={approval.id} className="flex flex-col gap-2 py-3 first:pt-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Link
                href={`/deals/${approval.dealId}`}
                className="text-sm font-medium text-foreground hover:underline"
              >
                {approval.dealTitle}
              </Link>
              <span className="text-xs text-muted-foreground">
                {approval.fromStageName ?? "Unknown stage"} →{" "}
                <span className="font-medium text-foreground">{approval.toStageName}</span>
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Requested by{" "}
              {[approval.requesterFirstName, approval.requesterLastName]
                .filter(Boolean)
                .join(" ") || "an unknown user"}
              {approval.reason ? ` — ${approval.reason}` : ""}
            </div>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                decide("reject", approval, String(f.get("note") ?? ""));
              }}
            >
              <Input
                name="note"
                placeholder="Reason (required to reject)"
                aria-label="Reason for rejecting this stage change"
                className="min-w-40 flex-1 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs outline-none transition-all placeholder:text-muted-foreground/70 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25"
              />
              <Button type="submit" variant="danger" disabled={pending}>
                Reject
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={pending}
                onClick={() => decide("approve", approval, "")}
              >
                {busyId === approval.id && pending ? "Saving…" : "Approve"}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
