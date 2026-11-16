import type { ReactNode } from "react";
import Link from "next/link";
import { ListChecks, UserCheck, type LucideIcon } from "lucide-react";

const items = [
  {
    label: "All tasks",
    href: "/tasks",
    icon: ListChecks,
  },
  {
    label: "My tasks",
    href: "/tasks/my-tasks",
    icon: UserCheck,
  },
] as const satisfies readonly {
  label: string;
  href: string;
  icon: LucideIcon;
}[];

/** The All/My tasks switch, with the page's main button on the same row. */
export function TasksNav({ current, action }: { current: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Task views" className="overflow-x-auto">
        <div className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-card p-1 shadow-sm">
          {items.map(({ label, href, icon: Icon }) => {
            const active = current === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:outline-none ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
      {action}
    </div>
  );
}
