"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { EmptyCardState } from "./empty-card-state";
import { InfoField, type InfoFieldSpec } from "./info-field";

/** A named group of fields rendered under a small subheading. */
export type InfoFieldGroup = {
  heading?: string;
  fields: InfoFieldSpec[];
};

type InfoCardProps = {
  title: string;
  /** One or more groups; a bare `fields` array is treated as a single group. */
  groups?: InfoFieldGroup[];
  fields?: InfoFieldSpec[];
  /** Destination for the muted "Add" links and the empty-state button. */
  editHref?: string;
  /** Message shown when every field in the card is empty. */
  emptyMessage?: string;
  /** Optional extra content rendered inside the card (e.g. notes form). */
  children?: ReactNode;
  className?: string;
};

function hasValue(value: InfoFieldSpec["value"]): boolean {
  if (value === null || value === undefined) return false;
  return typeof value === "string" ? value.trim().length > 0 : true;
}

export function InfoCard({
  title,
  groups,
  fields,
  editHref,
  emptyMessage = "No details have been added yet.",
  children,
  className,
}: InfoCardProps) {
  const [showEmpty, setShowEmpty] = useState(false);
  const headingId = useId();

  const resolvedGroups: InfoFieldGroup[] = groups ?? [{ fields: fields ?? [] }];
  const allFields = resolvedGroups.flatMap((group) => group.fields);
  const cardIsEmpty = allFields.every((field) => !hasValue(field.value));

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-xl border border-border bg-card p-5 shadow-xs dark:shadow-none",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <h2 id={headingId} className="text-[16px] font-semibold leading-none">
          {title}
        </h2>
        {!cardIsEmpty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowEmpty((prev) => !prev)}
            aria-pressed={showEmpty}
            className="h-7 gap-1.5 px-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            {showEmpty ? (
              <EyeOff aria-hidden="true" className="size-3.5" />
            ) : (
              <Eye aria-hidden="true" className="size-3.5" />
            )}
            {showEmpty ? "Hide empty fields" : "Show empty fields"}
          </Button>
        )}
      </div>

      {cardIsEmpty ? (
        <div className="pt-4">
          <EmptyCardState message={emptyMessage} actionHref={editHref} />
        </div>
      ) : (
        <div className="space-y-5 pt-4">
          {resolvedGroups.map((group, index) => {
            const visible = group.fields.some((field) => hasValue(field.value) || showEmpty);
            if (!visible) return null;
            const stats = group.fields.filter((field) => field.variant === "stat");
            const details = group.fields.filter((field) => field.variant !== "stat");
            const field = (spec: InfoFieldSpec) => (
              <InfoField key={spec.label} field={spec} showEmpty={showEmpty} addHref={editHref} />
            );
            return (
              <div key={group.heading ?? index} className="space-y-3">
                {group.heading && (
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {group.heading}
                  </h3>
                )}
                {stats.length > 0 && (
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{stats.map(field)}</dl>
                )}
                {details.length > 0 && (
                  <dl
                    className={cn(
                      "grid gap-x-6 gap-y-5 sm:grid-cols-2",
                      stats.length > 0 && "border-t border-border/60 pt-5",
                    )}
                  >
                    {details.map(field)}
                  </dl>
                )}
              </div>
            );
          })}
          {children}
        </div>
      )}
    </section>
  );
}
