import { Search, X } from "lucide-react";
import { type InputHTMLAttributes, forwardRef } from "react";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  onClear?: () => void;
};

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    { placeholder = "Search name, email, code...", value = "", onClear, className = "", ...props },
    ref,
  ) => {
    const hasValue = value !== "" && value !== undefined;

    return (
      <div className="relative flex-1 min-w-full sm:min-w-[240px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          type="text"
          placeholder={placeholder}
          defaultValue={value}
          className={`h-9 w-full rounded-lg border border-border/60 bg-background px-3 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all hover:border-border focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25 ${className}`}
          {...props}
        />
        {hasValue && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  },
);

SearchInput.displayName = "SearchInput";

type SelectProps = Omit<React.ComponentProps<"select">, "children"> & {
  children: React.ReactNode;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ children, className = "", ...props }, ref) => {
    return (
      // Phones: two filters per row instead of ragged intrinsic widths.
      <NativeSelect
        ref={ref}
        wrapperClassName="max-sm:flex-1 max-sm:basis-[calc(50%-0.25rem)]"
        className={`h-9 max-sm:w-full rounded-lg border border-border/60 bg-background text-sm text-foreground outline-none transition-all hover:border-border focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25 cursor-pointer ${className}`}
        {...props}
      >
        {children}
      </NativeSelect>
    );
  },
);

Select.displayName = "Select";

type ToolbarSearchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** Controlled toolbar search box: search icon on the left, clear button on the right. */
export const ToolbarSearch = forwardRef<HTMLInputElement, ToolbarSearchProps>(
  ({ value, onValueChange, className = "", ...props }, ref) => (
    <div className="relative flex-1 min-w-full sm:min-w-[240px]">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={`h-9 w-full rounded-lg border border-border/60 bg-background px-3 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all hover:border-border focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25 ${className}`}
        {...props}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {value !== "" && (
          <button
            type="button"
            onClick={() => onValueChange("")}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  ),
);

ToolbarSearch.displayName = "ToolbarSearch";
