"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { executeNextStep } from "../actions/marketing.actions";

export function ExecuteStepButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await executeNextStep(id);
          if (!result.success) {
            notify(result.error.message, "error");
            return;
          }
          notify("Next step done.", "success");
          router.refresh();
        })
      }
    >
      {pending ? "Working…" : "Do next step"}
    </Button>
  );
}
