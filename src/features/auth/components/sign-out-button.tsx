"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      aria-label="Sign out"
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace("/login");
        router.refresh();
      }}
      className="inline-flex items-center rounded-lg border border-border bg-card p-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-primary disabled:opacity-60 sm:px-3"
    >
      <LogOut className="size-4 sm:hidden" />
      <span className="hidden sm:inline">{pending ? "Signing out..." : "Sign out"}</span>
    </Button>
  );
}
