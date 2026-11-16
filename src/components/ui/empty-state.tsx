import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-border bg-card shadow-xs">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mb-4 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
