"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/components/ui/toast";
import { authClient } from "@/lib/auth/client";

import { authButtonClass, authFieldClass, authLabelClass, authLinkClass } from "../lib/auth-styles";
import { resetErrorMessage } from "../lib/reset-error";

/** The one place these forms say "centred, full-width link". */
const blockLink = `${authLinkClass} block text-center`;

const alertClass =
  "rounded-[10px] border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-[13px] leading-5 text-destructive";

const statusClass =
  "rounded-[10px] border border-green-500/30 bg-green-500/10 px-3.5 py-3 text-[13px] leading-5 text-green-700 dark:text-green-300";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    await authClient.requestPasswordReset({
      email: String(formData.get("email")),
      redirectTo: "/reset-password",
    });
    setPending(false);
    setSent(true);
  }

  if (sent)
    return (
      <div>
        <p role="status" className={statusClass}>
          If the account exists, a reset link is on its way.
        </p>
        <Link href="/login" className={`mt-5 ${blockLink}`}>
          Back to sign in
        </Link>
      </div>
    );

  return (
    <form action={submit} className="space-y-5">
      <div>
        <Label htmlFor="reset-email" className={authLabelClass}>
          Email address
        </Label>
        <Input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          placeholder="you@example.com"
          className={authFieldClass}
        />
      </div>
      <Button disabled={pending} aria-busy={pending} className={authButtonClass}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/login" className={blockLink}>
        Back to sign in
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ token, invalid }: { token?: string; invalid: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!token || invalid)
    return (
      <div>
        <p role="alert" className={alertClass}>
          This link is invalid or expired.
        </p>
        <Link href="/forgot-password" className={`mt-5 ${blockLink}`}>
          Request a new link
        </Link>
      </div>
    );

  async function submit(formData: FormData) {
    const password = String(formData.get("password"));
    const confirmation = String(formData.get("confirmation"));
    if (password !== confirmation) {
      notify("Passwords don't match.", "error");
      return;
    }
    setPending(true);
    const result = await authClient.resetPassword({
      newPassword: password,
      token: token!,
    });
    setPending(false);
    if (result.error) {
      notify(resetErrorMessage(result.error), "error");
      return;
    }
    notify("Password updated.", "success");
    router.replace("/login?reset=success");
  }

  return (
    <form action={submit} className="space-y-5">
      <div>
        <Label htmlFor="new-password" className={authLabelClass}>
          New password
        </Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          disabled={pending}
          className={authFieldClass}
        />
      </div>
      <div>
        <Label htmlFor="confirm-password" className={authLabelClass}>
          Confirm password
        </Label>
        <Input
          id="confirm-password"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          disabled={pending}
          className={authFieldClass}
        />
      </div>
      <Button disabled={pending} aria-busy={pending} className={authButtonClass}>
        {pending ? "Updating…" : "Set new password"}
      </Button>
    </form>
  );
}
