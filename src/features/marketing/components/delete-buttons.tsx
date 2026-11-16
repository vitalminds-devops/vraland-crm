"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { deleteMessageTemplate, deleteSequence } from "../actions/marketing.actions";

export function DeleteSequenceButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete "${name}" and its steps? This cannot be undone.`)) return;
        startTransition(async () => {
          const result = await deleteSequence(id);
          if (!result.success) {
            notify(result.error.message, "error");
            return;
          }
          notify("Follow-up deleted.", "success");
          router.push("/marketing/automations");
          router.refresh();
        });
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}

export function DeleteTemplateButton({
  type,
  id,
  name,
}: {
  type: "email" | "sms";
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const listPath = `/marketing/${type}-templates`;

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            `Delete "${name}"? Completed campaigns using it will lose the message. This cannot be undone.`,
          )
        )
          return;
        startTransition(async () => {
          const result = await deleteMessageTemplate(type, id);
          if (!result.success) {
            notify(result.error.message, "error");
            return;
          }
          notify("Template deleted.", "success");
          router.push(listPath);
          router.refresh();
        });
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
