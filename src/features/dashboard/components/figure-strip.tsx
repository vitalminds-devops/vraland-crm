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
        // 1px gaps over a border-coloured ground draw the dividers, at any column count.
        "grid gap-px overflow-hidden rounded-xl border border-border bg-border",
        "grid-cols-2",
        figures.length >= 3 && "md:grid-cols-3",
        figures.length >= 5 ? "xl:grid-cols-5" : figures.length === 4 && "xl:grid-cols-4",
      )}
    >
      {figures.map((figure, index) => {
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
        const cell = cn(
          "min-w-0 bg-card px-4 py-4 sm:px-5",
          // An odd count leaves the last one alone on phones; let it span the row.
          figures.length % 2 === 1 && index === figures.length - 1 && "col-span-2 md:col-span-1",
        );
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
