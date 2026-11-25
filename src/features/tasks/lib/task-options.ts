import {
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  Mail,
  Phone,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

export const TASK_TYPES = [
  "follow_up",
  "call",
  "email",
  "document",
  "viewing",
  "closing",
  "general",
] as const;

export const TASK_STATUSES = ["todo", "in_progress", "completed", "cancelled"] as const;

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

/** The icon each type carries in the list, so the type is scannable. */
export const TASK_TYPE_ICONS: Record<string, LucideIcon> = {
  follow_up: RefreshCw,
  call: Phone,
  email: Mail,
  document: FileText,
  viewing: Eye,
  closing: ClipboardCheck,
  general: ClipboardList,
};

export type TaskTone = "brand-1" | "brand-2" | "brand-3" | "brand-4" | "muted" | "danger";

export const taskToneClasses: Record<TaskTone, { bg: string; text: string; dot: string }> = {
  "brand-1": { bg: "bg-brand-1/10", text: "text-brand-1", dot: "bg-brand-1" },
  "brand-2": { bg: "bg-brand-2/10", text: "text-brand-2", dot: "bg-brand-2" },
  "brand-3": { bg: "bg-brand-3/10", text: "text-brand-3", dot: "bg-brand-3" },
  "brand-4": { bg: "bg-brand-4/10", text: "text-brand-4", dot: "bg-brand-4" },
  muted: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  danger: {
    bg: "bg-destructive/10",
    text: "text-destructive",
    dot: "bg-destructive",
  },
};

export const TASK_STATUS_TONES: Record<string, { label: string; tone: TaskTone }> = {
  todo: { label: "To do", tone: "brand-1" },
  in_progress: { label: "In progress", tone: "brand-3" },
  completed: { label: "Completed", tone: "brand-4" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export const TASK_PRIORITY_TONES: Record<string, TaskTone> = {
  low: "brand-4",
  medium: "brand-3",
  high: "brand-2",
  urgent: "brand-1",
};

/** "follow_up" → "Follow up". */
export function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export const taskTypeLabel = (value: string) =>
  value === "follow_up" ? "Follow-up" : titleCase(value);
export const taskStatusLabel = titleCase;
export const taskPriorityLabel = titleCase;
