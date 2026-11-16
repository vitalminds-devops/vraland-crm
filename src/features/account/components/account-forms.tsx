"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Check, Eye, EyeOff, KeyRound, UserRound } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/toast";
import { updateOwnProfile } from "../actions/account.actions";
import { getUserFacingMessage } from "@/lib/error-handler";
import { fieldErrorsOf } from "@/lib/types/action-result.client";
import {
  accountProfileSchema,
  changePasswordSchema,
  type AccountProfileInput,
  type ChangePasswordInput,
} from "../schemas/account.schema";

const inputClass = "mt-1.5 h-10 min-w-0 w-full rounded-lg border bg-background px-3 py-2 text-sm";

export function ProfileForm({ profile }: { profile: AccountProfileInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<AccountProfileInput>({
    resolver: zodResolver(accountProfileSchema),
    defaultValues: profile,
  });
  const submit = handleSubmit((value) =>
    startTransition(async () => {
      const result = await updateOwnProfile(value);
      if (!result.success) {
        Object.entries(fieldErrorsOf(result)).forEach(([field, messages]) =>
          setError(field as keyof AccountProfileInput, {
            message: messages[0],
          }),
        );
        notify(result.error.message, "error");
        return;
      }
      notify("Profile saved.", "success");
      reset(value);
      router.refresh();
    }),
  );

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-5 sm:p-6">
      <CardTitle icon={UserRound} hint="How your name and number appear to your team.">
        Personal details
      </CardTitle>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName?.message}>
          <Input autoComplete="given-name" {...register("firstName")} className={inputClass} />
        </Field>
        <Field label="Last name" error={errors.lastName?.message}>
          <Input autoComplete="family-name" {...register("lastName")} className={inputClass} />
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <Input
            type="tel"
            autoComplete="tel"
            placeholder="e.g. 0917 123 4567"
            {...register("phone")}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-5 flex items-center justify-end gap-3 border-t pt-4">
        {isDirty && (
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            disabled={pending}
            onClick={() => reset()}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          className="h-10 px-6"
          disabled={pending || !isDirty}
        >
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    control,

    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmation: "" },
  });
  const [shown, setShown] = useState(false);
  const next = useWatch({ control, name: "newPassword" });
  const confirmation = useWatch({ control, name: "confirmation" });
  const checks = [
    { label: "At least 12 characters", ok: next.length >= 12 },
    { label: "Both new passwords match", ok: Boolean(next) && next === confirmation },
  ];
  const type = shown ? "text" : "password";
  const submit = handleSubmit((value) =>
    startTransition(async () => {
      const result = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        notify(
          result.error.code === "INVALID_PASSWORD"
            ? "Current password is wrong."
            : getUserFacingMessage(result.error) || "Couldn't change password.",
          "error",
        );
        return;
      }
      reset();
      notify("Password changed.", "success");
    }),
  );
  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <CardTitle icon={KeyRound} hint="Changing it signs you out on other devices.">
          Password
        </CardTitle>
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-pressed={shown}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {shown ? (
            <EyeOff aria-hidden="true" className="size-3.5" />
          ) : (
            <Eye aria-hidden="true" className="size-3.5" />
          )}
          {shown ? "Hide" : "Show"} passwords
        </button>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field
          label="Current password"
          error={errors.currentPassword?.message}
          className="sm:col-span-2"
        >
          <Input
            type={type}
            autoComplete="current-password"
            {...register("currentPassword")}
            className={inputClass}
          />
        </Field>
        <Field label="New password" error={errors.newPassword?.message}>
          <Input
            type={type}
            autoComplete="new-password"
            {...register("newPassword")}
            className={inputClass}
          />
        </Field>
        <Field label="Confirm new password" error={errors.confirmation?.message}>
          <Input
            type={type}
            autoComplete="new-password"
            {...register("confirmation")}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {checks.map((check) => (
            <li
              key={check.label}
              className={`flex items-center gap-1.5 ${
                check.ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
              }`}
            >
              <Check aria-hidden="true" className={`size-3.5 ${check.ok ? "" : "opacity-30"}`} />
              {check.label}
            </li>
          ))}
        </ul>
        <Button type="submit" variant="primary" className="h-10 px-6" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  className = "",
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`text-sm font-medium ${className}`}>
      {label}
      {children}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

/** A card heading with a small tinted icon. */
function CardTitle({
  icon: Icon,
  hint,
  children,
}: {
  icon: typeof UserRound;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon aria-hidden="true" className="size-[18px]" />
      </span>
      <div>
        <h2 className="font-semibold">{children}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
