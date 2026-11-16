"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/components/ui/toast";
import { reassignDealAgent } from "../actions/deal-reassign.actions";

type Agent = { id: string; firstName: string | null; lastName: string | null };

export function ReassignAgentButton({
  dealId,
  currentAgentId,
  agents,
}: {
  dealId: string;
  currentAgentId: string | null;
  agents: Agent[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const choices = agents.filter((agent) => agent.id !== currentAgentId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await reassignDealAgent({
        dealId,
        agentUserId: form.get("agentUserId"),
        reason: form.get("reason"),
      });
      notify(
        result.success ? "Reassigned." : result.error.message,
        result.success ? "success" : "error",
      );
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="gap-2">
          <UserRoundCog aria-hidden="true" className="size-4" />
          Reassign agent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>Reassign agent</DialogTitle>
        <DialogDescription>Commission moves too.</DialogDescription>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="reassign-agent">Agent</Label>
            <NativeSelect id="reassign-agent" name="agentUserId" required defaultValue="">
              <NativeSelectOption value="" disabled>
                Choose an agent
              </NativeSelectOption>
              {choices.map((agent) => (
                <NativeSelectOption key={agent.id} value={agent.id}>
                  {`${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim()}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reassign-reason">Reason</Label>
            <Textarea id="reassign-reason" name="reason" required rows={3} maxLength={500} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !choices.length}>
              Reassign
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
