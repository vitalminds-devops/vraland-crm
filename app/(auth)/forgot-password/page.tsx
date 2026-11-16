import type { Metadata } from "next";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/password-forms";
export const metadata: Metadata = { title: "Forgot password" };
export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" description="We’ll email you a reset link.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
