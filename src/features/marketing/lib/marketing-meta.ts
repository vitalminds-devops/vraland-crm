import type { DotBadgeTone } from "@/components/ui/dot-badge";

export const campaignStatuses = ["draft", "scheduled", "running", "paused", "completed"] as const;
export const campaignChannels = ["email", "sms", "social"] as const;
export const sequenceTriggers = [
  "lead_created",
  "deal_stage_changed",
  "viewing_completed",
  "manual",
] as const;

export type CampaignStatus = (typeof campaignStatuses)[number];
export type CampaignChannel = (typeof campaignChannels)[number];
export type SequenceTrigger = (typeof sequenceTriggers)[number];

export const MARKETING_PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_MARKETING_PAGE_SIZE = 20;

function humanizeValue(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

const campaignStatusLabels: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
};

const channelLabels: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  social: "Social",
};

const recipientStatusLabels: Record<string, string> = {
  pending: "Pending",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  failed: "Failed",
};

const triggerLabels: Record<string, string> = {
  lead_created: "A new lead is added",
  deal_stage_changed: "A deal changes stage",
  viewing_completed: "A viewing is completed",
  manual: "I add people myself",
};

const stepActionLabels: Record<string, string> = {
  send_email: "Send email",
  send_sms: "Send SMS",
  create_task: "Create task",
  wait: "Wait",
  assign_user: "Assign user",
};

const enrollmentStatusLabels: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const runStatusLabels: Record<string, string> = {
  running: "Running",
  queued: "Queued",
  success: "Success",
  failed: "Failed",
};

export function campaignStatusLabel(value: string): string {
  return campaignStatusLabels[value] ?? humanizeValue(value);
}

export function channelLabel(value: string): string {
  return channelLabels[value] ?? humanizeValue(value);
}

export function recipientStatusLabel(value: string): string {
  return recipientStatusLabels[value] ?? humanizeValue(value);
}

export function triggerLabel(value: string): string {
  return triggerLabels[value] ?? humanizeValue(value);
}

export function stepActionLabel(value: string): string {
  return stepActionLabels[value] ?? humanizeValue(value);
}

export function enrollmentStatusLabel(value: string): string {
  return enrollmentStatusLabels[value] ?? humanizeValue(value);
}

export function runStatusLabel(value: string): string {
  return runStatusLabels[value] ?? humanizeValue(value);
}

const campaignStatusTones: Record<string, DotBadgeTone> = {
  draft: "gray",
  scheduled: "blue",
  running: "amber",
  paused: "purple",
  completed: "green",
};

const channelTones: Record<string, DotBadgeTone> = {
  email: "blue",
  sms: "purple",
  social: "amber",
};

const recipientStatusTones: Record<string, DotBadgeTone> = {
  pending: "gray",
  sent: "blue",
  delivered: "purple",
  opened: "green",
  clicked: "green",
  failed: "red",
};

const triggerTones: Record<string, DotBadgeTone> = {
  lead_created: "blue",
  deal_stage_changed: "purple",
  viewing_completed: "amber",
  manual: "gray",
};

const enrollmentStatusTones: Record<string, DotBadgeTone> = {
  active: "blue",
  completed: "green",
  failed: "red",
  cancelled: "gray",
};

const runStatusTones: Record<string, DotBadgeTone> = {
  running: "blue",
  queued: "amber",
  success: "green",
  failed: "red",
};

export function campaignStatusTone(value: string): DotBadgeTone {
  return campaignStatusTones[value] ?? "gray";
}

export function channelTone(value: string): DotBadgeTone {
  return channelTones[value] ?? "gray";
}

export function recipientStatusTone(value: string): DotBadgeTone {
  return recipientStatusTones[value] ?? "gray";
}

export function triggerTone(value: string): DotBadgeTone {
  return triggerTones[value] ?? "gray";
}

export function enrollmentStatusTone(value: string): DotBadgeTone {
  return enrollmentStatusTones[value] ?? "gray";
}

export function runStatusTone(value: string): DotBadgeTone {
  return runStatusTones[value] ?? "gray";
}

function includes<T extends readonly string[]>(
  values: T,
  value: string | undefined,
): value is T[number] {
  return value !== undefined && (values as readonly string[]).includes(value);
}

export function isCampaignStatus(value: string | undefined): value is CampaignStatus {
  return includes(campaignStatuses, value);
}

export function isCampaignChannel(value: string | undefined): value is CampaignChannel {
  return includes(campaignChannels, value);
}

export function isSequenceTrigger(value: string | undefined): value is SequenceTrigger {
  return includes(sequenceTriggers, value);
}
