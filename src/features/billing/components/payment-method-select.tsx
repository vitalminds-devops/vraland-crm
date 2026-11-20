"use client";

import { useRef, useState } from "react";
import { ChevronDown, Wallet } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";
import { paymentMethodLabels, paymentMethods } from "../schemas/billing.schema";

export function PaymentMethodSelect({
  name,
  value,
  onValueChange,
  label = "Financing",
  placeholder = "Select financing",
  required = false,
  disabled = false,
}: {
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [invalid, setInvalid] = useState(false);
  const selected = paymentMethodLabels[value as keyof typeof paymentMethodLabels];
  const change = (next: string) => {
    setInvalid(false);
    onValueChange(next);
  };

  return (
    <div className="relative min-w-0">
      {/* This menu must own focus while its parent dialog traps it. */}
      <DropdownMenu modal>
        <DropdownMenuTrigger asChild>
          <button
            ref={trigger}
            type="button"
            aria-label={label}
            data-invalid={invalid || undefined}
            disabled={disabled}
            className="group flex h-10 w-full items-center gap-2.5 rounded-md border border-input bg-card px-3 text-left text-sm shadow-xs outline-none transition-[border-color,box-shadow] hover:border-primary/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 data-[invalid=true]:border-destructive data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/20"
          >
            <Wallet aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>
              {selected || placeholder}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="z-[80] max-h-[min(320px,var(--radix-dropdown-menu-content-available-height))] w-[var(--radix-dropdown-menu-trigger-width)] rounded-lg p-1"
        >
          <DropdownMenuRadioGroup aria-label={label} value={value} onValueChange={change}>
            {paymentMethods.map((method) => (
              <DropdownMenuRadioItem
                key={method}
                value={method}
                className="min-h-10 cursor-pointer rounded-md pr-3 data-[state=checked]:bg-primary/10 data-[state=checked]:font-medium data-[state=checked]:text-primary"
              >
                {paymentMethodLabels[method]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <select
        name={name}
        value={value}
        onChange={(event) => change(event.target.value)}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onInvalid={(event) => {
          event.preventDefault();
          setInvalid(true);
          trigger.current?.focus();
        }}
      >
        <option value="">{placeholder}</option>
        {paymentMethods.map((method) => (
          <option key={method} value={method}>
            {paymentMethodLabels[method]}
          </option>
        ))}
      </select>
      {invalid && (
        <span role="alert" className="mt-1 block text-xs text-destructive">
          Choose an option to continue.
        </span>
      )}
    </div>
  );
}
