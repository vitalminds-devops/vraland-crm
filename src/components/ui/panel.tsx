import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The page card every detail page is built from (the property Access page set the look): one
 * border, a slim header with the title and a muted count or actions on the right, and the body
 * below. Split the body into panes with dividers; never put a bordered card inside a panel.
 */
export function Panel({
  title,
  meta,
  actions,
  flush = false,
  id,
  className,
  children,
}: {
  title?: ReactNode;
  /** Short muted text on the right, such as "3 people" or "10 floors · 99 units". */
  meta?: ReactNode;
  /** Small buttons or a status badge on the right of the header. */
  actions?: ReactNode;
  /** Drop the body padding, for bodies split into panes or full-bleed lists. */
  flush?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "min-w-0 scroll-mt-20 overflow-hidden rounded-xl border border-border/60 bg-card",
        className,
      )}
    >
      {title && (
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/40 px-4 py-2.5">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {(meta || actions) && (
            <div className="flex items-center gap-2">
              {meta && (
                <span className="text-[12px] text-muted-foreground tabular-nums">{meta}</span>
              )}
              {actions}
            </div>
          )}
        </header>
      )}
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </section>
  );
}
