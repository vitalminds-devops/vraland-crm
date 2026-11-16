import type { Metadata } from "next";
import Link from "next/link";

import { authLinkClass } from "@/features/auth/lib/auth-styles";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center px-6 py-16">
      <h1 className="text-[30px] leading-tight font-semibold tracking-[-0.02em] text-foreground">
        Terms of use
      </h1>
      <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
        These terms have not been published yet. Until they are, contact your administrator for the
        conditions that apply to your access to this system.
      </p>
      <Link href="/login" className={`mt-8 ${authLinkClass}`}>
        Back to sign in
      </Link>
    </main>
  );
}
