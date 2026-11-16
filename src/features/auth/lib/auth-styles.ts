/** Labels sit 8px above their field, at 14px medium. */
export const authLabelClass = "mb-2 block text-sm font-medium text-foreground";

export const authFieldClass =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-base text-foreground shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60";

/** The field's border and ring when it holds an error. */
export const authFieldErrorClass =
  "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20";

/** 13px, directly under the field it belongs to. */
export const authFieldMessageClass = "mt-2 text-[13px] leading-5 text-destructive";

export const authButtonClass =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-colors duration-150 hover:bg-primary/90 active:bg-primary/95 disabled:cursor-not-allowed disabled:opacity-60";

/** A text link on the form. */
export const authLinkClass =
  "rounded text-sm font-medium text-primary transition-colors duration-150 hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none";
