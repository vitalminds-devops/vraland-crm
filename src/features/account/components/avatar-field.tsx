"use client";

import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { notify, notifyLoading } from "@/components/ui/toast";
import { checkImageUpload } from "@/lib/storage/image-uploads";
import { updateOwnAvatar } from "../actions/account.actions";

/**
 * The profile picture (a photo, or initials), then `children` (name and roles), then a
 * "Profile photo" panel with plain buttons to upload or remove it.
 */
export function AvatarField({
  src,
  initials,
  children,
}: {
  src: string | null;
  initials: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const choose = () => input.current?.click();

  function save(form: FormData, done: string) {
    startTransition(async () => {
      const toastId = notifyLoading("Saving profile photo…", "save-avatar");
      try {
        if (form.get("remove") !== "true") {
          const checked = await checkImageUpload(form.get("image"));
          if (!checked.ok) {
            notify("Profile photo not accepted", "error", {
              id: toastId,
              description: checked.message,
            });
            return;
          }
        }
        const result = await updateOwnAvatar(form);
        if (!result.success) return void notify(result.error.message, "error", toastId);
        notify(done, "success", toastId);
        router.refresh();
      } catch {
        notify("Could not confirm photo update", "error", {
          id: toastId,
          description:
            "Refresh your profile to check whether the photo was saved before uploading again.",
        });
      }
    });
  }

  function upload(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set("image", file);
    save(form, "Photo updated.");
  }

  function remove() {
    const form = new FormData();
    form.set("remove", "true");
    save(form, "Photo removed.");
  }

  return (
    <>
      <button
        type="button"
        onClick={choose}
        disabled={pending}
        title={src ? "Change photo" : "Add a photo"}
        aria-label={src ? "Change photo" : "Add a photo"}
        className="group relative -mt-10 block size-20 rounded-full ring-4 ring-card focus-visible:ring-primary/50 focus-visible:outline-none"
      >
        <span className="grid size-full place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-fuchsia-600 text-2xl font-semibold text-white">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route
            <img src={src} alt="" className="size-full object-cover" />
          ) : (
            initials || "?"
          )}
          {pending && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50">
              <Loader2 aria-hidden="true" className="size-6 animate-spin" />
            </span>
          )}
        </span>
        {/* Always visible, so it is clear the picture can be changed. */}
        <span className="absolute right-0 bottom-0 grid size-7 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-110">
          <Camera aria-hidden="true" className="size-3.5" />
        </span>
      </button>

      {children}

      <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-3">
        <p className="text-sm font-medium">Profile photo</p>
        <p className="mt-0.5 text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB.</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={src ? "secondary" : "primary"}
            onClick={choose}
            disabled={pending}
            className="gap-1.5"
          >
            <ImagePlus aria-hidden="true" className="size-3.5" />
            {src ? "Change photo" : "Upload photo"}
          </Button>
          {src && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={remove}
              disabled={pending}
              className="gap-1.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              Remove
            </Button>
          )}
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </>
  );
}
