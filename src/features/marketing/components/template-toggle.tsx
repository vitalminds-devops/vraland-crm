"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { toggleMessageTemplate } from "../actions/marketing.actions";

export function TemplateToggle({
  type,
  id,
  name,
  active,
}: {
  type: "email" | "sms";
  id: string;
  name: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      aria-label={`${active ? "Turn off" : "Turn on"} ${name}`}
      title={active ? "Hide it when picking a message" : "Offer it when picking a message"}
      onClick={() =>
        startTransition(async () => {
          const result = await toggleMessageTemplate(type, id, !active);
          if (!result.success) {
            notify(result.error.message, "error");
            return;
          }
          notify(
            active ? "Turned off. It no longer shows when picking a message." : "Turned on.",
            "success",
          );
          router.refresh();
        })
      }
    >
      {pending ? "Saving…" : active ? "Turn off" : "Turn on"}
    </Button>
  );
}
