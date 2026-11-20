"use client";

import { ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";

import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

import { changeTaskStatus } from "../actions/task.actions";
import {
  TASK_STATUS_TONES,
  TASK_STATUSES,
  taskStatusLabel,
  taskToneClasses,
  type TaskTone,
} from "../lib/task-options";

const toneFor = (status: string): TaskTone => TASK_STATUS_TONES[status]?.tone ?? "muted";

export function TaskStatus({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(status);
  const colors = taskToneClasses[toneFor(value)];

  if (!pending && value !== status) setValue(status);

  const onChange = (next: string) => {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await changeTaskStatus({ id, status: next });
      if (!result.success) {
        setValue(previous);
        notify(result.error.message || "Couldn't update status.", "error");
      }
    });
  };

  return (
    <div className="relative inline-flex w-full max-w-32">
      <select
        aria-label="Task status"
        aria-busy={pending}
        disabled={pending}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-10 w-full cursor-pointer appearance-none rounded-md border border-border bg-card py-0 pr-7 pl-3 text-xs leading-normal font-medium outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-wait disabled:opacity-70",
          colors.bg,
          colors.text,
        )}
      >
        {TASK_STATUSES.map((option) => (
          <option key={option} value={option}>
            {TASK_STATUS_TONES[option]?.label ?? taskStatusLabel(option)}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 opacity-70",
          colors.text,
        )}
      />
    </div>
  );
}
