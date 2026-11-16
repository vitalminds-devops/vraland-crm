import Link from "next/link";
import {
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageSquare,
  Workflow,
  type LucideIcon,
} from "lucide-react";

// Templates come first: a campaign or a follow-up step needs one.
const items = [
  {
    label: "Overview",
    href: "/marketing",
    icon: LayoutDashboard,
  },
  {
    label: "Email templates",
    href: "/marketing/email-templates",
    icon: Mail,
  },
  {
    label: "SMS templates",
    href: "/marketing/sms-templates",
    icon: MessageSquare,
  },
  {
    label: "Campaigns",
    href: "/marketing/campaigns",
    icon: Megaphone,
  },
  {
    label: "Follow-ups",
    href: "/marketing/automations",
    icon: Workflow,
  },
] as const satisfies readonly {
  label: string;
  href: string;
  icon: LucideIcon;
}[];

export function MarketingNav({ current }: { current: string }) {
  return (
    <nav aria-label="Marketing sections" className="mb-6 overflow-x-auto">
      <div className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-card p-1 shadow-sm">
        {items.map(({ label, href, icon: Icon }) => {
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
