export const fieldClass =
  "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25";

/** A labelled field in the Move to Opportunity dialog. */
export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px] font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}
