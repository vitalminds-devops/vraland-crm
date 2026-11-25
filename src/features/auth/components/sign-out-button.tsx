"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils/cn";

/** A button in the top bar, or a full-width row in the phone menu (`inMenu`). */
export function SignOutButton({ inMenu = false }: { inMenu?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant={inMenu ? "ghost" : "secondary"}
      size="sm"
      disabled={pending}
      aria-label={inMenu ? undefined : "Sign out"}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace("/login");
        router.refresh();
      }}
      className={cn(
        inMenu
          ? "h-12 w-full justify-start gap-3 rounded-none px-3 text-sm font-medium text-destructive hover:bg-muted hover:text-destructive"
          : "inline-flex items-center rounded-lg border border-border bg-card p-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-primary disabled:opacity-60 sm:px-3",
      )}
    >
      <LogOut className={cn(inMenu ? "size-5" : "size-4 sm:hidden")} />
      <span className={cn(!inMenu && "hidden sm:inline")}>
        {pending ? "Signing out…" : "Sign out"}
      </span>
    </Button>
  );
}
