"use client";

import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/components/ui/toast";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils/cn";

import {
  authButtonClass,
  authFieldClass,
  authFieldErrorClass,
  authFieldMessageClass,
  authLabelClass,
  authLinkClass,
} from "../lib/auth-styles";

/** Per-field messages, so a complaint sits under the field it is about. */
type FieldErrors = { email?: string; password?: string };

const MIN_PASSWORD_LENGTH = 12;

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const rememberMe = formData.get("rememberMe") === "on";

    const errors: FieldErrors = {};
    if (!email) errors.email = "Enter your email address.";
    else if (!email.includes("@")) errors.email = "Enter a valid email address.";
    if (!password) errors.password = "Enter your password.";
    else if (password.length < MIN_PASSWORD_LENGTH)
      errors.password = `Passwords are at least ${MIN_PASSWORD_LENGTH} characters.`;

    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setPending(true);
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        rememberMe,
      });

      if (result.error) {
        notify(result.error.message || "Wrong email or password.", "error");
        return;
      }

      notify("Signed in.", "success");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Something went wrong. Try again.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={submit} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="email" className={authLabelClass}>
          Email address
        </Label>
        <div className="relative">
          <Mail
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={pending}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            placeholder="you@example.com"
            className={cn(authFieldClass, "pl-11", fieldErrors.email && authFieldErrorClass)}
          />
        </div>
        {fieldErrors.email && (
          <p id="email-error" className={authFieldMessageClass}>
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="password" className={authLabelClass}>
          Password
        </Label>
        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={pending}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            placeholder="••••••••••••"
            className={cn(
              authFieldClass,
              "pr-12 pl-11",
              fieldErrors.password && authFieldErrorClass,
            )}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset focus-visible:outline-none"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="size-[18px]" />
            ) : (
              <Eye aria-hidden="true" className="size-[18px]" />
            )}
          </button>
        </div>
        {fieldErrors.password && (
          <p id="password-error" className={authFieldMessageClass}>
            {fieldErrors.password}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="rememberMe"
          className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none"
        >
          <Checkbox
            id="rememberMe"
            name="rememberMe"
            defaultChecked
            disabled={pending}
            className="size-4 accent-primary disabled:cursor-not-allowed"
          />
          Remember me
        </label>
        <Link href="/forgot-password" className={authLinkClass}>
          Forgot password?
        </Link>
      </div>

      <Button type="submit" disabled={pending} aria-busy={pending} className={authButtonClass}>
        {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
        {pending ? "Signing in…" : "Sign in"}
        {!pending && <ArrowRight aria-hidden="true" className="size-4" />}
      </Button>
    </form>
  );
}
