"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { metresInRange, settleMetres } from "../lib/metres";

/**
 * A size in metres that can be typed freely: "1" on the way to "12" isn't forced up to the
 * minimum. The size applies as soon as the text is a number in range, and leaving the field (or
 * Enter) settles anything else to the nearest allowed size.
 */
export function MetreInput({
  value,
  min,
  max,
  onCommit,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type" | "min" | "max"> & {
  value: number;
  min: number;
  max: number;
  onCommit: (metres: number) => void;
}) {
  // Only while typing; otherwise the field shows the size itself, so undo and redo show through.
  const [draft, setDraft] = useState<string | null>(null);
  const settle = () => {
    if (draft === null) return;
    const settled = settleMetres(draft, min, max);
    if (settled !== null) onCommit(settled);
    setDraft(null);
  };
  return (
    <Input
      {...props}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      value={draft ?? value}
      onChange={(event) => {
        setDraft(event.target.value);
        const typed = metresInRange(event.target.value, min, max);
        if (typed !== null) onCommit(typed);
      }}
      onBlur={settle}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          settle();
        }
        props.onKeyDown?.(event);
      }}
    />
  );
}
