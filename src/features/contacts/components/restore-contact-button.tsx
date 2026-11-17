"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify } from "@/components/ui/toast";
import { restoreContact, type ContactErrorDetails } from "../actions/contact.actions";

type Agent = { id: string; firstName: string; lastName: string };

export function RestoreContactButton({
  contactId,
  agents,
}: {
  contactId: string;
  agents: Agent[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Shown once restore reports that the contact's agent has left.
  const [picking, setPicking] = useState(false);
  const [agentId, setAgentId] = useState("");

  const handleRestore = () => {
    startTransition(async () => {
      const result = await restoreContact(contactId, picking ? agentId : undefined);
      if (!result.success) {
        notify(result.error.message, "error");
        if ((result.error.details as ContactErrorDetails | undefined)?.needsAgent && agents.length)
          setPicking(true);
        return;
      }
      notify("Contact restored.", "success");
      router.refresh();
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {picking && (
        <NativeSelect
          aria-label="New agent"
          wrapperClassName="w-44"
          value={agentId}
          onChange={(event) => setAgentId(event.target.value)}
          disabled={pending}
        >
          <NativeSelectOption value="">New agent</NativeSelectOption>
          {agents.map((agent) => (
            <NativeSelectOption key={agent.id} value={agent.id}>
              {agent.firstName} {agent.lastName}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      <Button
        type="button"
        variant="secondary"
        className="gap-2"
        disabled={pending || (picking && !agentId)}
        onClick={handleRestore}
        aria-label="Restore contact"
      >
        <RotateCcw className="h-4 w-4" />
        {pending ? "Restoring…" : "Restore"}
      </Button>
    </div>
  );
}
