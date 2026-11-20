"use client";

import { Image as ImageIcon, ImagePlus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { notify, notifyLoading } from "@/components/ui/toast";
import { checkImageUpload } from "@/lib/storage/image-uploads";
import { removeUnitImage, saveUnitImage } from "../actions/unit.actions";

/** What the upload input offers, and what the action accepts. */
const unitImageAccept = "image/jpeg,image/png,image/webp";

export function UnitPictureDialog({
  unitId,
  code,
  imageUrl,
  onClose,
}: {
  unitId: string;
  code: string;
  imageUrl: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const shownUrl = previewUrl ?? imageUrl;

  const choose = (file: File | undefined) => {
    if (!file) return;

    const formData = new FormData();
    formData.set("unitId", unitId);
    formData.set("image", file);

    startTransition(async () => {
      const toastId = notifyLoading("Uploading unit picture…", `upload-unit-picture-${unitId}`);
      try {
        const checked = await checkImageUpload(file);
        if (!checked.ok) {
          notify("Unit picture not accepted", "error", {
            id: toastId,
            description: checked.message,
          });
          if (inputRef.current) inputRef.current.value = "";
          return;
        }
        setPreviewUrl(URL.createObjectURL(file));
        const result = await saveUnitImage(formData);
        if (!result.success) {
          setPreviewUrl(null);
          if (inputRef.current) inputRef.current.value = "";
          notify(result.message, "error", toastId);
          return;
        }
        setPreviewUrl(null);
        if (inputRef.current) inputRef.current.value = "";
        notify(result.message, "success", toastId);
        router.refresh();
      } catch {
        setPreviewUrl(null);
        if (inputRef.current) inputRef.current.value = "";
        notify("Could not confirm picture upload", "error", {
          id: toastId,
          description:
            "Refresh this unit to check whether the picture was saved before uploading again.",
        });
      }
    });
  };

  const clear = () => {
    startTransition(async () => {
      const result = await removeUnitImage(unitId);
      if (!result.success) {
        notify(result.message, "error");
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
      notify(result.message, "success");
      router.refresh();
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <DialogPopup className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
              <div>
                <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">
                  Unit {code} picture
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-[13px] text-muted-foreground">
                  JPEG, PNG or WebP, up to 5 MB.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close"
                className="size-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-5">
              {shownUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route, which next/image's optimiser cannot fetch.
                <img
                  src={shownUrl}
                  alt={`${code} picture`}
                  className="mx-auto max-h-[60vh] w-auto rounded-lg border border-border/60 object-contain"
                />
              ) : (
                <div className="grid h-56 place-content-center gap-2 rounded-lg border border-dashed border-border/60 text-muted-foreground">
                  <ImageIcon
                    aria-hidden="true"
                    className="mx-auto size-8 text-muted-foreground/50"
                  />
                  <span className="text-[13px]">No picture yet</span>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-border/60 px-5 py-4">
              <input
                ref={inputRef}
                type="file"
                name="image"
                accept={unitImageAccept}
                disabled={pending}
                onChange={(event) => choose(event.target.files?.[0])}
                className="hidden"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => inputRef.current?.click()}
                  disabled={pending}
                  className="gap-2"
                >
                  <ImagePlus aria-hidden="true" className="size-4" />
                  {shownUrl ? "Replace picture" : "Add picture"}
                </Button>
                {shownUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clear}
                    disabled={pending}
                    className="inline-flex h-auto items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Remove picture
                  </Button>
                )}
                {pending && <span className="text-[13px] text-muted-foreground">Uploading…</span>}
              </div>
            </div>
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
