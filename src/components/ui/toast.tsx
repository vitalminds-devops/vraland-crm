"use client";

import { Toaster as SonnerToaster, toast as sonner } from "sonner";

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
            "text-xs font-medium rounded-lg border border-border/60 bg-card text-foreground shadow-lg shadow-foreground/5",
          description: "text-muted-foreground",
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

export function notify(message: string, tone: ToastTone = "info", id?: string | number) {
  const options = id === undefined ? undefined : { id };
  if (tone === "success") return sonner.success(message, options);
  if (tone === "error") return sonner.error(message, options);
  return sonner(message, options);
}

export function notifyLoading(message: string) {
  return sonner.loading(message);
}
