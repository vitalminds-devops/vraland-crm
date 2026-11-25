"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { deleteDevelopment } from "../actions/development-delete.actions";

export function DevelopmentDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      try {
        const result = await deleteDevelopment(id);
        if (!result.success) {
          notify(result.error.message, "error");
          return;
        }
        notify("Development deleted.", "success");
        router.replace("/developments");
      } catch {
        notify("Couldn't delete the development. Try again.", "error");
      }
    });

  return (
    <>
      <Button type="button" variant="secondary" className="gap-2" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden="true" className="size-4" />
        Delete development
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !pending) setOpen(false);
        }}
      >
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
            <DialogPopup
              aria-describedby={undefined}
              className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
            >
              <DialogTitle className="text-lg font-semibold">Delete {name}?</DialogTitle>
              <div className="mt-5 flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="button" variant="danger" disabled={pending} onClick={confirm}>
                  {pending ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>
    </>
  );
}
