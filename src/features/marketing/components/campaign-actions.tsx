"use client";

import { Eye, Pause, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RowActionsMenu, type MenuItem } from "@/components/ui/row-actions-menu";
import { notify, notifyLoading } from "@/components/ui/toast";
import { deleteCampaign, pauseCampaign, sendCampaign } from "../actions/marketing.actions";

const iconClass = "h-4 w-4 text-muted-foreground";

function canSend(status: string, channel: string, allowed: boolean) {
  return allowed && ["draft", "scheduled", "paused"].includes(status) && channel !== "social";
}

/** Only something waiting to go out, or going out, can be paused; a draft never sends by itself. */
function canPause(status: string) {
  return ["scheduled", "running"].includes(status);
}

function canDelete(status: string, allowed: boolean) {
  return allowed && !["running", "completed"].includes(status);
}

function useCampaignActions(id: string, name: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const send = () => {
    if (!window.confirm(`Send "${name}" now to everyone who hasn't received it yet?`)) return;
    startTransition(async () => {
      const toastId = notifyLoading("Sending campaign…");
      const result = await sendCampaign(id);
      if (!result.success) {
        notify(result.error.message, "error", toastId);
        return;
      }
      notify("Campaign sent.", "success", toastId);
      router.refresh();
    });
  };

  const pause = () => {
    startTransition(async () => {
      const result = await pauseCampaign(id);
      if (!result.success) {
        notify(result.error.message, "error");
        return;
      }
      notify("Campaign paused.", "success");
      router.refresh();
    });
  };

  const remove = () => {
    if (!window.confirm(`Delete "${name}" and its recipient list? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteCampaign(id);
      if (!result.success) {
        notify(result.error.message, "error");
        return;
      }
      notify("Campaign deleted.", "success");
      router.push("/marketing/campaigns");
      router.refresh();
    });
  };

  return { pending, send, pause, remove };
}

/** Header actions on a campaign's detail page. */
export function CampaignHeaderActions({
  id,
  name,
  status,
  channel,
  canManage,
  canSendMessages,
  canDeleteCampaign,
}: {
  id: string;
  name: string;
  status: string;
  channel: string;
  canManage: boolean;
  canSendMessages: boolean;
  canDeleteCampaign: boolean;
}) {
  const { pending, send, pause, remove } = useCampaignActions(id, name);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManage && canPause(status) ? (
        <Button type="button" variant="secondary" disabled={pending} onClick={pause}>
          Pause
        </Button>
      ) : null}
      {canDelete(status, canDeleteCampaign) ? (
        <Button type="button" variant="secondary" disabled={pending} onClick={remove}>
          Delete
        </Button>
      ) : null}
      {canSend(status, channel, canSendMessages) ? (
        <Button type="button" variant="primary" disabled={pending} onClick={send}>
          {pending ? "Working…" : status === "paused" ? "Send now (resume)" : "Send now"}
        </Button>
      ) : null}
    </div>
  );
}

/** Row menu in the campaigns table. */
export function CampaignRowActions({
  id,
  name,
  status,
  channel,
  canManage,
  canSendMessages,
  canDeleteCampaign,
}: {
  id: string;
  name: string;
  status: string;
  channel: string;
  canManage: boolean;
  canSendMessages: boolean;
  canDeleteCampaign: boolean;
}) {
  const { pending, send, pause, remove } = useCampaignActions(id, name);

  const items: MenuItem[] = [
    {
      label: "View campaign",
      icon: <Eye className={iconClass} aria-hidden="true" />,
      href: `/marketing/campaigns/${id}`,
    },
  ];
  if (canSend(status, channel, canSendMessages))
    items.push({
      label: status === "paused" ? "Send now (resume)" : "Send now",
      icon: <Send className={iconClass} aria-hidden="true" />,
      onSelect: send,
      disabled: pending,
    });
  if (canManage && canPause(status))
    items.push({
      label: "Pause campaign",
      icon: <Pause className={iconClass} aria-hidden="true" />,
      onSelect: pause,
      disabled: pending,
    });
  if (canDelete(status, canDeleteCampaign))
    items.push({
      label: "Delete campaign",
      icon: <Trash2 className={iconClass} aria-hidden="true" />,
      onSelect: remove,
      disabled: pending,
      destructive: true,
    });

  return (
    <RowActionsMenu ariaLabel={`Actions for ${name}`} sections={[{ label: "Campaign", items }]} />
  );
}
