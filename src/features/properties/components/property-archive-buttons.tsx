"use client";

import { Archive, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { notify } from "@/components/ui/toast";
import { archiveProperty, restoreProperty } from "../actions/property.actions";

export function ArchivePropertyButton({
  propertyId,
  title,
  menuItem = false,
}: {
  propertyId: string;
  title: string;
  menuItem?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const archive = () => {
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
  };
  const caption = pending ? "Archiving…" : "Archive";
  if (menuItem)
    return (
      <DropdownMenuItem
        disabled={pending}
        onSelect={archive}
        className="min-h-10 gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
      >
        <Archive aria-hidden="true" className="size-4" />
        {caption}
      </DropdownMenuItem>
    );
  return (
    <Button
      type="button"
      variant="ghost"
      className="gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      disabled={pending}
      onClick={archive}
    >
      <Archive aria-hidden="true" className="size-4" />
      {caption}
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
