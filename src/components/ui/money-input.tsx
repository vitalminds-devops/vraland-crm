"use client";

import { useState, type ComponentProps } from "react";

import { Input } from "./input";

/** Digits with commas, at most one decimal point and two decimals: "2300000.5" -> "2,300,000.5". */
export function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  const decimals = rest.join("").slice(0, 2);
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cleaned.includes(".") ? `${grouped || "0"}.${decimals}` : grouped;
}

const plain = (display: string) => display.replaceAll(",", "");

type MoneyInputProps = Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange" | "name"
> & {
  /** Submits the plain number under this name through a hidden input (form posts). */
  name?: string;
  defaultValue?: string | number | null;
  /** Controlled use: the plain number, and a callback with the new plain number. */
  value?: string | number | null;
  onValueChange?: (value: string) => void;
};

/**
 * A peso amount typed with thousands separators. The box shows commas; callers and forms
 * only ever see the plain number.
 */
export function MoneyInput({
  name,
  defaultValue,
  value,
  onValueChange,
  placeholder = "0.00",
  ...props
}: MoneyInputProps) {
  const controlled = value !== undefined;
  const [local, setLocal] = useState(() => formatMoneyInput(String(defaultValue ?? "")));
  const display = controlled ? formatMoneyInput(String(value ?? "")) : local;
  return (
    <>
      <Input
        {...props}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={display}
        onChange={(event) => {
          const next = formatMoneyInput(event.target.value);
          if (!controlled) setLocal(next);
          onValueChange?.(plain(next));
        }}
      />
      {name && <input type="hidden" name={name} value={plain(display)} />}
    </>
  );
}
