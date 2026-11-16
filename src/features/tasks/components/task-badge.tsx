import { type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

import { taskToneClasses, type TaskTone } from "../lib/task-options";

export function TaskBadge({
  tone,
  children,
  className,
}: {
  tone: TaskTone;
  children: ReactNode;
  className?: string;
}) {
  const colors = taskToneClasses[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        colors.bg,
        colors.text,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} aria-hidden="true" />
      {children}
    </span>
  );
}
