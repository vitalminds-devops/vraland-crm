import { DotBadge, type DotBadgeTone } from "@/components/ui/dot-badge";
import { lifecycleLabel, lifecycleStageOf, type LifecycleStage } from "../lib/contact-options";

type LifecycleBadgeProps = {
  value: string | null;
};

const lifecycleTones: Record<LifecycleStage, DotBadgeTone> = {
  active_client: "green",
  inactive: "gray",
};

export function LifecycleBadge({ value }: LifecycleBadgeProps) {
  if (!value) {
    return <span className="text-sm text-muted-foreground">Not specified</span>;
  }
  const stage = lifecycleStageOf(value);
  return <DotBadge tone={stage ? lifecycleTones[stage] : "gray"}>{lifecycleLabel(value)}</DotBadge>;
}
