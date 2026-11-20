"use client";

import { Toaster as SonnerToaster, toast as sonner, type ExternalToast } from "sonner";
import { Check, Info, X, AlertCircle } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import styles from "./toast.module.css";

export function ToastProvider({ theme = "light" }: { theme?: "light" | "dark" }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return (
    <SonnerToaster
      className={hidden ? styles.paused : undefined}
      theme={theme}
      position="bottom-right"
      duration={2600}
      gap={8}
      expand
      offset={12}
      visibleToasts={3}
      closeButton
      richColors={false}
      icons={{
        success: <Check aria-hidden="true" />,
        error: <AlertCircle aria-hidden="true" />,
        info: <Info aria-hidden="true" />,
        warning: <AlertCircle aria-hidden="true" />,
        close: <X aria-hidden="true" size={16} />,
      }}
      style={{ pointerEvents: "auto" }}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast: styles.toast,
          title: styles.title,
          description: styles.description,
          icon: styles.icon,
          closeButton: styles.closeButton,
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-foreground",
          success: styles.success,
          info: styles.info,
          warning: styles.warning,
          error: styles.error,
        },
      }}
    />
  );
}

export type ToastTone = "success" | "error" | "info" | "warning";

export function notify(
  message: string,
  tone: ToastTone = "info",
  idOrOptions?: string | number | Pick<ExternalToast, "id" | "description">,
) {
  const content = typeof idOrOptions === "object" ? idOrOptions : { id: idOrOptions };
  const duration =
    tone === "error" || tone === "warning" ? 8000 : content.description ? 6000 : 2600;
  const options = {
    duration,
    closeButton: true,
    style: { "--toast-duration": `${duration}ms` } as CSSProperties,
    ...content,
  };
  if (tone === "success") return sonner.success(message, options);
  if (tone === "error") return sonner.error(message, options);
  if (tone === "warning") return sonner.warning(message, options);
  return sonner(message, { ...options, icon: <Info aria-hidden="true" /> });
}

export function notifyLoading(message: string, id?: string | number) {
  return id === undefined ? sonner.loading(message) : sonner.loading(message, { id });
}
