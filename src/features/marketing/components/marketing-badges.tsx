import { DotBadge } from "@/components/ui/dot-badge";
import {
  campaignStatusLabel,
  campaignStatusTone,
  channelLabel,
  channelTone,
  enrollmentStatusLabel,
  enrollmentStatusTone,
  recipientStatusLabel,
  recipientStatusTone,
  runStatusLabel,
  runStatusTone,
  stepActionLabel,
  triggerLabel,
  triggerTone,
} from "../lib/marketing-meta";

export function CampaignStatusBadge({ status }: { status: string }) {
  return <DotBadge tone={campaignStatusTone(status)}>{campaignStatusLabel(status)}</DotBadge>;
}

export function ChannelBadge({ channel }: { channel: string }) {
  return <DotBadge tone={channelTone(channel)}>{channelLabel(channel)}</DotBadge>;
}

export function RecipientStatusBadge({ status }: { status: string }) {
  return <DotBadge tone={recipientStatusTone(status)}>{recipientStatusLabel(status)}</DotBadge>;
}

export function TriggerBadge({ trigger }: { trigger: string }) {
  return <DotBadge tone={triggerTone(trigger)}>{triggerLabel(trigger)}</DotBadge>;
}

export function EnrollmentStatusBadge({ status }: { status: string }) {
  return <DotBadge tone={enrollmentStatusTone(status)}>{enrollmentStatusLabel(status)}</DotBadge>;
}

export function RunStatusBadge({ status }: { status: string }) {
  return <DotBadge tone={runStatusTone(status)}>{runStatusLabel(status)}</DotBadge>;
}

export function SequenceStatusBadge({ isActive }: { isActive: boolean }) {
  return <DotBadge tone={isActive ? "green" : "gray"}>{isActive ? "Active" : "Inactive"}</DotBadge>;
}

export function StepActionLabel({ action }: { action: string }) {
  return <>{stepActionLabel(action)}</>;
}
