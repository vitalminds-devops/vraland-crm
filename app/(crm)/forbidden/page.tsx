import { ButtonLink } from "@/components/ui/button";
export default function ForbiddenPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <section className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <p className="text-sm font-semibold text-red-700">Access denied</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          You don’t have access to this page.
        </h1>
        <ButtonLink href="/dashboard" variant="primary" className="mt-6">
          Back to dashboard
        </ButtonLink>
      </section>
    </main>
  );
}
