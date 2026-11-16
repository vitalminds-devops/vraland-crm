"use client";

import { Plus } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/toast";

type CountField = { name: string; label: string; min: number; initial: number };

/** An "Add" button that asks how many before adding floors, units or parking. */
export function AddCountDialog({
  label,
  title,
  fields,
  extra,
  onAdd,
  buttonClassName,
  variant = "secondary",
}: {
  label: string;
  title: string;
  fields: CountField[];
  /** More inputs under the counts, such as a floor picker. */
  extra?: ReactNode;
  onAdd: (values: Record<string, number>) => Promise<{ success: boolean; message: string }>;
  buttonClassName?: string;
  variant?: "secondary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const initial = () =>
    Object.fromEntries(fields.map((field) => [field.name, String(field.initial)]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const valid = fields.every((field) => {
    const value = Number(values[field.name]);
    return Number.isInteger(value) && value >= field.min && value <= 100;
  });

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => {
          setValues(initial());
          setOpen(true);
        }}
        className={buttonClassName ?? "gap-1"}
      >
        <Plus aria-hidden="true" className="size-3.5" />
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !pending) setOpen(false);
        }}
      >
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
            <DialogPopup className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
              <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!valid) return;
                  startTransition(async () => {
                    try {
                      const result = await onAdd(
                        Object.fromEntries(
                          fields.map((field) => [field.name, Number(values[field.name])]),
                        ),
                      );
                      notify(result.message, result.success ? "success" : "error");
                      if (result.success) setOpen(false);
                    } catch {
                      notify("Couldn't add. Try again.", "error");
                    }
                  });
                }}
              >
                {fields.map((field, index) => (
                  <label key={field.name} className="grid gap-1.5 text-sm font-medium">
                    {field.label}
                    <Input
                      type="number"
                      inputMode="numeric"
                      required
                      min={field.min}
                      max={100}
                      step={1}
                      value={values[field.name]}
                      onChange={(event) =>
                        setValues({ ...values, [field.name]: event.target.value })
                      }
                      disabled={pending}
                      autoFocus={index === 0}
                    />
                  </label>
                ))}
                {extra}
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary" disabled={pending}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" variant="primary" disabled={pending || !valid}>
                    {pending ? "Adding…" : "Add"}
                  </Button>
                </div>
              </form>
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>
    </>
  );
}
