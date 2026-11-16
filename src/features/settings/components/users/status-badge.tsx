import { DotBadge, type DotBadgeTone } from "@/components/ui/dot-badge";

type StatusBadgeProps = {
  value: string | null;
  className?: string;
};

export const userStatusLabels = {
  invited: "Invited",
  active: "Active",
  // Named after the action that sets it, so "Deactivate" leads to "Deactivated".
  inactive: "Deactivated",
  suspended: "Suspended",
} as const;

export type UserStatus = keyof typeof userStatusLabels;

const statusTone: Record<UserStatus, DotBadgeTone> = {
  active: "green",
  invited: "blue",
  inactive: "gray",
  suspended: "red",
};

export function StatusBadge({ value, className }: StatusBadgeProps) {
  const normalized = (value ?? "inactive").toLowerCase() as UserStatus;
  const label = userStatusLabels[normalized] ?? normalized;

  return (
    <DotBadge tone={statusTone[normalized] ?? "gray"} className={className}>
      {label}
    </DotBadge>
  );
}
