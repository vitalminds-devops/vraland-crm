"use client";

import { Toaster as SonnerToaster, toast as sonner, type ExternalToast } from "sonner";

export function ToastProvider({ theme = "light" }: { theme?: "light" | "dark" }) {
  return (
    <SonnerToaster
      theme={theme}
      position="top-center"
      duration={2600}
      gap={8}
      offset={12}
      visibleToasts={3}
      closeButton={false}
      richColors={false}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "text-sm font-medium rounded-lg border border-border/60 bg-card text-foreground shadow-lg shadow-foreground/5",
          description:
            "text-sm leading-relaxed text-muted-foreground whitespace-pre-line break-words",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-foreground",
          success: "text-foreground",
          error: "text-foreground",
        },
      }}
    />
  );
}

export type ToastTone = "success" | "error" | "info";

export function notify(
  message: string,
  tone: ToastTone = "info",
  idOrOptions?: string | number | Pick<ExternalToast, "id" | "description">,
) {
  const content = typeof idOrOptions === "object" ? idOrOptions : { id: idOrOptions };
  const options = {
    duration: tone === "error" ? 8000 : content.description ? 6000 : 2600,
    closeButton: tone === "error",
    ...content,
  };
  if (tone === "success") return sonner.success(message, options);
  if (tone === "error") return sonner.error(message, options);
  return sonner(message, options);
}

export function notifyLoading(message: string) {
  return sonner.loading(message);
}
