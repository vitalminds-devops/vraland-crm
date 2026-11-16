import Link from "next/link";
import {
  LayoutDashboard,
  Percent,
  ScrollText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { PermissionKey } from "@/lib/permissions/catalog";

const items = [
  {
    label: "Overview",
    href: "/settings",
    permission: "settings.view",
    icon: LayoutDashboard,
  },
  {
    label: "Users",
    href: "/settings/users",
    permission: "users.manage",
    icon: Users,
  },
  {
    label: "Roles & permissions",
    href: "/settings/roles",
    permission: "roles.manage",
    icon: ShieldCheck,
  },
  {
    label: "Commissions",
    href: "/settings/commissions",
    permission: "roles.manage",
    icon: Percent,
  },
  {
    label: "Logs",
    href: "/settings/logs",
    permission: "settings.audit",
    icon: ScrollText,
  },
] as const satisfies readonly {
  label: string;
  href: string;
  permission: PermissionKey | null;
  icon: LucideIcon;
}[];

export function SettingsNav({
  permissions,
  current,
}: {
  permissions: ReadonlySet<string>;
  current: string;
}) {
  return (
    <nav aria-label="Settings sections" className="mb-6 overflow-x-auto">
      <div className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-card p-1 shadow-sm">
        {items
          .filter((item) => item.permission === null || permissions.has(item.permission))
          .map(({ label, href, icon: Icon }) => {
            const active = current === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${
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
  );
}
