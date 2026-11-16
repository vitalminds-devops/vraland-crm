"use client";

import { Archive, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { archiveProperty, restoreProperty } from "../actions/property.actions";

export function ArchivePropertyButton({
  propertyId,
  title,
}: {
  propertyId: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      className="gap-2"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Archive ${title}? You can restore it from the archive.`)) return;
        startTransition(async () => {
          const result = await archiveProperty(propertyId);
          if (!result.success) {
            notify(result.message, "error");
            return;
          }
          notify("Property archived.", "success");
          router.push("/properties");
        });
      }}
    >
      <Archive aria-hidden="true" className="size-4" />
      {pending ? "Archiving…" : "Archive"}
    </Button>
  );
}

export function RestorePropertyButton({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      className="gap-2"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await restoreProperty(propertyId);
          if (!result.success) {
            notify(result.message, "error");
            return;
          }
          notify("Property restored.", "success");
          router.refresh();
        })
      }
    >
      <RotateCcw aria-hidden="true" className="size-4" />
      {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}
