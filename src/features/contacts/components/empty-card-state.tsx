import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type EmptyCardStateProps = {
  message: string;
  /** Where "Add details" should go; omit to render the button-less variant. */
  actionHref?: string;
  actionLabel?: string;
  action?: ReactNode;
};

export function EmptyCardState({
  message,
  actionHref,
  actionLabel = "Add details",
  action,
}: EmptyCardStateProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-3">
      <p className="text-[13px] text-muted-foreground">{message}</p>
      {action ??
        (actionHref ? (
          <Link
            href={actionHref}
            className={cn(buttonVariants({ variant: "secondary" }), "gap-1.5")}
          >
            {actionLabel}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        ) : null)}
    </div>
  );
}
