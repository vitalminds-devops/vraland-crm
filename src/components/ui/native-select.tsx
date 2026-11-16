import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils/cn";

type NativeSelectProps = React.ComponentProps<"select"> & {
  /** Sizing for the wrapper (e.g. `w-48`, `flex-1`) when the select sits in a flex or grid row. */
  wrapperClassName?: string;
};

function NativeSelect({ className, wrapperClassName, ...props }: NativeSelectProps) {
  return (
    <div
      data-slot="native-select-wrapper"
      className={cn("relative has-[select:disabled]:opacity-50", wrapperClassName)}
    >
      <select
        data-slot="native-select"
        className={cn(
          "h-10 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-input bg-card py-2 pl-3 text-base shadow-xs outline-none transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed aria-invalid:border-destructive sm:text-sm",
          className,
          // Last, so a caller's px-* can't push the text under the chevron, and its py-* can't
          // clip it: Safari lays select text out from the top padding, so a fixed height plus
          // vertical padding cuts the letters off on phones. With none, the height centres it.
          "pr-9 py-0 leading-normal",
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        data-slot="native-select-icon"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

function NativeSelectOption(props: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}

function NativeSelectOptGroup(props: React.ComponentProps<"optgroup">) {
  return <optgroup data-slot="native-select-optgroup" {...props} />;
}

export { NativeSelect, NativeSelectOption, NativeSelectOptGroup };
