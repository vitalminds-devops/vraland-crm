import type { Metadata } from "next";
import Link from "next/link";

import { authLinkClass } from "@/features/auth/lib/auth-styles";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center px-6 py-16">
      <h1 className="text-[30px] leading-tight font-semibold tracking-[-0.02em] text-foreground">
        Privacy notice
      </h1>
      <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
        This notice has not been published yet. Until it is, contact your administrator for how VRA
        Real Estate collects, uses, and retains the information held in this system.
      </p>
      <Link href="/login" className={`mt-8 ${authLinkClass}`}>
        Back to sign in
      </Link>
    </main>
  );
}
