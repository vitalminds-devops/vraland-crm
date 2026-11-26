import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export type Figure = {
  key: string;
  label: string;
  /** The amount, shown large. */
  value: string;
  /** The count or context, shown small underneath. */
  detail: string;
  href?: string;
};

/**
 * The dashboard's headline money: one divided strip instead of a row of boxes, so the amounts
 * read left to right and none competes for attention with a card of its own.
 */
export function FigureStrip({ figures }: { figures: Figure[] }) {
  if (!figures.length) return null;
  return (
    <section
      aria-label="Key figures"
      className={cn(
        // 1px gaps over a border-coloured ground draw the dividers. Figures grow to fill each row,
        // so however many there are, no empty (border-coloured) cell is left over.
        "flex flex-wrap gap-px overflow-hidden rounded-xl border border-border bg-border",
      )}
    >
      {figures.map((figure) => {
        const body = (
          <>
            <span className="block text-[12.5px] text-muted-foreground">{figure.label}</span>
            <span className="mt-1.5 block text-xl leading-tight font-semibold tracking-tight tabular-nums sm:text-[22px]">
              {figure.value}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
              {figure.detail}
            </span>
          </>
        );
        const cell = "min-w-0 flex-[1_1_10rem] bg-card px-4 py-4 sm:px-5 xl:flex-[1_1_12rem]";
        return figure.href ? (
          <Link
            key={figure.key}
            href={figure.href}
            className={cn(
              cell,
              "transition-colors hover:bg-muted/40 focus-visible:relative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            )}
          >
            {body}
          </Link>
        ) : (
          <div key={figure.key} className={cell}>
            {body}
          </div>
        );
      })}
    </section>
  );
}
