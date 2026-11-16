import type { Metadata } from "next";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ResetPasswordForm } from "@/features/auth/components/password-forms";
export const metadata: Metadata = { title: "Reset password" };
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const query = await searchParams;
  return (
    <AuthCard title="Choose a new password" description="At least 12 characters.">
      <ResetPasswordForm token={query.token} invalid={Boolean(query.error)} />
    </AuthCard>
  );
}
