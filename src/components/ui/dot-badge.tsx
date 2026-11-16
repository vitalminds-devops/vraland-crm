import { type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type DotBadgeTone = "blue" | "amber" | "green" | "purple" | "gray" | "red";

const dotBadgeTones: Record<DotBadgeTone, { bg: string; text: string; dot: string }> = {
  blue: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  green: { bg: "bg-green-500/10", text: "text-green-700 dark:text-green-400", dot: "bg-green-500" },
  purple: {
    bg: "bg-purple-500/10",
    text: "text-purple-700 dark:text-purple-400",
    dot: "bg-purple-500",
  },
  gray: { bg: "bg-gray-500/10", text: "text-gray-700 dark:text-gray-400", dot: "bg-gray-500" },
  red: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
};

export function DotBadge({
  tone,
  children,
  className,
}: {
  tone: DotBadgeTone;
  children: ReactNode;
  className?: string;
}) {
  const colors = dotBadgeTones[tone];
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
