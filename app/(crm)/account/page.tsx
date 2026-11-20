import { CalendarDays, Clock, Mail, Phone, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { PasswordForm, ProfileForm } from "@/features/account/components/account-forms";
import { AvatarField } from "@/features/account/components/avatar-field";
import { avatarSrc } from "@/features/account/lib/avatar";
import { getMyProfile } from "@/features/account/queries/account.queries";

const day = (value: Date) =>
  new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(value);

export default async function AccountPage() {
  const user = await getMyProfile();
  if (!user) notFound();
  const name = `${user.firstName} ${user.lastName}`.trim();
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  const brokerName = [user.brokerFirstName, user.brokerLastName].filter(Boolean).join(" ");
  const facts = [
    { icon: Mail, label: "Email", value: user.email, note: "Ask an admin to change it." },
    { icon: Phone, label: "Phone", value: user.phone },
    { icon: UserRound, label: "Broker", value: brokerName },
    { icon: CalendarDays, label: "Member since", value: day(user.createdAt) },
    { icon: Clock, label: "Last sign-in", value: user.lastLoginAt && day(user.lastLoginAt) },
  ].filter((fact) => fact.value);

  return (
    <PageContainer>
      <PageHeader title="My profile" description="Keep your details and password up to date." />

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-2xl border bg-card lg:sticky lg:top-4">
          <div
            aria-hidden="true"
            className="h-16 bg-[radial-gradient(120%_140%_at_0%_0%,#7b34ad_0%,#4a1d7a_55%,#2a1b5e_100%)]"
          />
          <div className="px-5 pb-5">
            <AvatarField src={avatarSrc(user.id, user.avatarUrl)} initials={initials}>
              <h2 className="mt-3 text-lg leading-tight font-semibold break-words">{name}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {user.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                  >
                    {role}
                  </span>
                ))}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    user.status === "active"
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                  {user.status === "active" ? "Active" : user.status}
                </span>
              </div>
            </AvatarField>
          </div>
          <dl className="grid gap-4 border-t px-5 py-5 text-sm">
            {facts.map(({ icon: Icon, label, value, note }) => (
              <div key={label} className="flex min-w-0 gap-3">
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value}</dd>
                  {note && <dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd>}
                </div>
              </div>
            ))}
          </dl>
        </aside>

        <div className="grid gap-6">
          <ProfileForm
            profile={{
              firstName: user.firstName,
              lastName: user.lastName,
              phone: user.phone ?? "",
            }}
          />
          <PasswordForm />
        </div>
      </div>
    </PageContainer>
  );
}
