/**
 * Utility functions for development-related UI operations.
 */

import type { DotBadgeTone } from "@/components/ui/dot-badge";

export function label(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (v) => v.toUpperCase());
}

export function statusBadgeTone(status: string): DotBadgeTone {
  if (status === "active" || status === "pre_selling") return "green";
  if (status === "planning") return "amber";
  return "gray";
}

export function formatDate(value: string | Date | null): string {
  if (!value) return "Not set";
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateForInput(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

/**
 * Standard input field styling.
 */
export const fieldClass =
  "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25";
