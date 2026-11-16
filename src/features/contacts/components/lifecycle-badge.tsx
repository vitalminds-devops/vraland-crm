import { DotBadge, type DotBadgeTone } from "@/components/ui/dot-badge";
import { lifecycleLabels } from "../lib/contact-options";

type LifecycleBadgeProps = {
  value: string | null;
};

const lifecycleTones: Record<string, DotBadgeTone> = {
  lead: "blue",
  prospect: "amber",
  active_client: "green",
  past_client: "purple",
  inactive: "gray",
};

export function LifecycleBadge({ value }: LifecycleBadgeProps) {
  if (!value) {
    return <span className="text-sm text-muted-foreground">Not specified</span>;
  }

  const normalized = value.toLowerCase();
  const label = lifecycleLabels[normalized as keyof typeof lifecycleLabels] ?? value;

  return <DotBadge tone={lifecycleTones[normalized] ?? "gray"}>{label}</DotBadge>;
}
