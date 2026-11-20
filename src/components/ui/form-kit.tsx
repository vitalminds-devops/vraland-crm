import type { ReactNode } from "react";

import { NativeSelect } from "@/components/ui/native-select";

const tokens = `
  .crm-form {
    --form-accent: var(--primary);
    --accent-light: color-mix(in srgb, var(--form-accent) 20%, transparent);
    --surface: var(--background);
    --surface-raised: var(--card);
    --border-strong: color-mix(in oklab, var(--foreground) 22%, transparent);
    --text: var(--foreground);
    --text-muted: var(--muted-foreground);
    --placeholder: var(--muted-foreground);
    --danger: var(--destructive);
  }
`;

/** Renders the token block. Once per form, inside the form's own subtree. */
export function FormStyle() {
  return <style>{tokens}</style>;
}

export const formShellClass = "crm-form mx-auto w-full max-w-[720px] space-y-6 sm:space-y-10";

export const formCardClass =
  "min-w-0 flex-1 rounded-xl border border-border bg-card p-4 sm:p-6 lg:p-8 shadow-xs";

/** Save/cancel row that stays pinned to the bottom of the viewport on long forms. */
export const formActionsClass =
  "sticky bottom-0 z-10 flex flex-col items-end gap-3 border-t border-border bg-card/95 py-4 backdrop-blur max-sm:[&>p]:hidden sm:flex-row sm:items-center sm:justify-between";

export const formInputClass =
  "h-10 w-full rounded-md border border-input bg-[var(--surface-raised)] px-3 py-2 text-base sm:text-sm text-[var(--text)] placeholder-[var(--placeholder)] shadow-xs outline-none transition-[color,box-shadow,border-color] hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20";

const formSelectClass = `${formInputClass} cursor-pointer appearance-none pr-9`;

export const formTextareaClass =
  "w-full rounded-md border border-input bg-[var(--surface-raised)] px-3 py-2 text-base sm:text-sm text-[var(--text)] placeholder-[var(--placeholder)] shadow-xs outline-none transition-[color,box-shadow,border-color] hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 min-h-[100px] resize-y";

export function FormSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-b border-[var(--border)] pb-10 last:border-0">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--form-accent)] text-sm font-medium text-primary-foreground">
          {number}
        </span>
        <h2 className="text-lg font-semibold tracking-wide text-[var(--text)]">{title}</h2>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

/** Two fields side by side from `sm` up, stacked below it. */
export function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2">{children}</div>;
}

export function FormSelect({ children, ...props }: React.ComponentProps<"select">) {
  return (
    <NativeSelect {...props} className={formSelectClass}>
      {children}
    </NativeSelect>
  );
}

export function FormField({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-1 text-[14px]">
        <span className="shrink-0 font-medium text-[var(--text)]">{label}</span>
        {required && <span className="text-[var(--danger)]">*</span>}
        {hint && <span className="ml-2 min-w-0 text-[12px] text-[var(--text-muted)]">{hint}</span>}
      </div>
      {children}
      <div className="min-h-[16px]">
        {error && <span className="mt-1 block text-[12px] text-[var(--danger)]">{error}</span>}
      </div>
    </label>
  );
}
