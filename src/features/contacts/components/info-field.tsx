"use client";

import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

/** Serializable field descriptor so the server page can pass data (not JSX). */
export type InfoFieldSpec = {
  label: string;
  /** Raw value; empty string / null / undefined counts as "empty". */
  value?: string | number | null;
  /** Which renderer to use for a non-empty value. */
  variant?:
    | "text"
    | "email"
    | "phone"
    /** An address that opens elsewhere (a social profile) and is copied raw. */
    | "link"
    | "chips"
    | "agent"
    | "long"
    /** A headline figure, drawn as a tile the way the deal Summary draws value. */
    | "stat";
  /** Chip items for `variant="chips"`. */
  items?: readonly string[];
  /** `tel:` / `mailto:` target override. */
  href?: string;
  /** Avatar initials for `variant="agent"`. */
  initials?: string;
  /** Put this field in the full-width row instead of the 2-column grid. */
  wide?: boolean;
};

type InfoFieldProps = {
  field: InfoFieldSpec;
  /** When true, empty fields stay visible as a muted "Add" link. */
  showEmpty: boolean;
  addHref?: string;
};

function isPresent(value: InfoFieldSpec["value"]): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/** Inline copy-to-clipboard affordance that appears on hover / focus. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async (event) => {
        event.preventDefault();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard can be blocked (insecure context); fail silently.
        }
      }}
      className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/field:opacity-100"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-3.5 text-emerald-600" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
    </button>
  );
}

function FieldValue({ field }: { field: InfoFieldSpec }) {
  const { variant = "text", value, href, items, initials } = field;

  if (variant === "chips") {
    const list = items ?? [];
    if (!list.length) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {list.map((item) => (
          <span
            key={item}
            className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[12px] font-medium text-primary"
          >
            {item}
          </span>
        ))}
      </div>
    );
  }

  if (variant === "agent" && initials) {
    return (
      <span className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary ring-1 ring-inset ring-primary/15">
          {initials}
        </span>
        <span className="text-sm text-foreground">{value}</span>
      </span>
    );
  }

  const text = String(value);
  const linkable = variant === "email" || variant === "phone" || variant === "link";

  if (linkable) {
    return (
      <span className="flex items-center gap-1.5">
        <a
          href={href}
          className="text-sm break-all text-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          {text}
        </a>
        <CopyButton value={text} label={field.label} />
      </span>
    );
  }

  return <span className="text-sm break-words text-foreground">{text}</span>;
}

export function InfoField({ field, showEmpty, addHref }: InfoFieldProps) {
  const present = isPresent(field.value);

  if (!present && !showEmpty) return null;

  if (field.variant === "stat") {
    return (
      <div
        className={cn(
          "rounded-lg border border-border/60 bg-muted/40 px-4 py-3",
          field.wide && "sm:col-span-2",
        )}
      >
        <dt className="text-xs text-muted-foreground">{field.label}</dt>
        <dd className="mt-1 text-xl leading-tight font-semibold tracking-tight tabular-nums">
          {present ? (
            String(field.value)
          ) : addHref ? (
            <Link
              href={addHref}
              className="text-[13px] font-medium text-muted-foreground/80 underline-offset-2 hover:text-primary hover:underline"
            >
              Add
            </Link>
          ) : (
            <span className="font-normal text-muted-foreground/60">—</span>
          )}
        </dd>
      </div>
    );
  }

  if (!present) {
    return (
      <div className={cn("group/field space-y-1", field.wide && "sm:col-span-2")}>
        <dt className="text-xs text-muted-foreground">{field.label}</dt>
        <dd>
          {addHref ? (
            <Link
              href={addHref}
              className="inline-flex h-7 items-center rounded-md px-2 text-[13px] font-medium text-muted-foreground/80 transition-colors hover:bg-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:outline-none"
            >
              Add
            </Link>
          ) : (
            <span className="text-[13px] text-muted-foreground/60">Add</span>
          )}
        </dd>
      </div>
    );
  }

  return (
    <div className={cn("group/field space-y-1", field.wide && "sm:col-span-2")}>
      <dt className="text-xs text-muted-foreground">{field.label}</dt>
      <dd className="min-w-0">
        <FieldValue field={field} />
      </dd>
    </div>
  );
}
