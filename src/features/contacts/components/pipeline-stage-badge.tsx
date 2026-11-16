import { DotBadge, type DotBadgeTone } from "@/components/ui/dot-badge";

type PipelineStageBadgeProps = {
  /** Stage name the contact's deal sits in, or null when they have no deal. */
  stage: string | null;
  /** The stage's probability, used only to pick the tone. */
  probability: number | null;
};

function toneFor(probability: number | null): DotBadgeTone {
  const value = Number(probability);
  if (probability === null || !Number.isFinite(value)) return "gray";
  if (value >= 70) return "green";
  if (value >= 40) return "amber";
  return "gray";
}

export function PipelineStageBadge({ stage, probability }: PipelineStageBadgeProps) {
  if (!stage) {
    return <span className="text-sm text-muted-foreground">No deal</span>;
  }

  return <DotBadge tone={toneFor(probability)}>{stage}</DotBadge>;
}
