"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { restoreContact } from "../actions/contact.actions";

export function RestoreContactButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleRestore = () => {
    startTransition(async () => {
      const result = await restoreContact(contactId);
      if (!result.success) {
        notify(result.error.message, "error");
        return;
      }
      notify("Contact restored.", "success");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        className="gap-2"
        disabled={pending}
        onClick={handleRestore}
        aria-label="Restore contact"
      >
        <RotateCcw className="h-4 w-4" />
        {pending ? "Restoring…" : "Restore"}
      </Button>
    </div>
  );
}
