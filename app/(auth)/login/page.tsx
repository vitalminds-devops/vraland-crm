import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/features/auth/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { authLinkClass } from "@/features/auth/lib/auth-styles";
import { getCurrentSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to continue."
      footer={
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            No account yet? <span className="text-foreground">Ask your administrator.</span>
          </p>
          <p className="mt-3 flex items-center justify-center gap-5">
            <Link href="/privacy" className={authLinkClass}>
              Privacy
            </Link>
            <Link href="/terms" className={authLinkClass}>
              Terms
            </Link>
          </p>
        </div>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
