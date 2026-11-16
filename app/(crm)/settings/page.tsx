import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowRight,
  Clock3,
  Globe2,
  Mail,
  Phone,
  ScrollText,
  ShieldCheck,
  Users,
  UserCheck,
} from "lucide-react";

import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { DotBadge } from "@/components/ui/dot-badge";
import { SettingsNav } from "@/features/settings/components/settings-nav";
import { SystemPerformancePanel } from "@/features/settings/components/system-performance";
import { auditActionCopy, auditEntityLabel } from "@/features/settings/lib/audit-labels";
import { getSettingsSummary } from "@/features/settings/queries/settings.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export const metadata = { title: "Settings" };

function initials(name: string | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "—";
}

export default async function SettingsPage() {
  const context = await requirePagePermission("settings.view");
  const data = await getSettingsSummary();

  const canManageUsers = context.permissions.has("users.manage");
  const canManageRoles = context.permissions.has("roles.manage");
  const canViewLogs = context.permissions.has("settings.audit");
  const canViewSystem = context.permissions.has("settings.system");

  const { organization, users, roles } = data;
  const location =
    [organization?.city, organization?.province].filter(Boolean).join(", ") ||
    organization?.countryCode ||
    null;
  const regional = [organization?.timezone, organization?.currency].filter(Boolean).join(" · ");

  // Only what the name doesn't already say, e.g. no code under "Real Estate CRM (CRM-PROD)".
  const name = organization?.name ?? "";
  const subtitle = [
    organization?.legalName !== name ? organization?.legalName : null,
    organization?.code && !name.includes(organization.code) ? organization.code : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const meta: { key: string; icon: typeof Mail; value: string }[] = [];
  if (organization?.email) meta.push({ key: "email", icon: Mail, value: organization.email });
  if (organization?.phone) meta.push({ key: "phone", icon: Phone, value: organization.phone });
  if (location) meta.push({ key: "location", icon: Globe2, value: location });
  if (regional) meta.push({ key: "regional", icon: Clock3, value: regional });

  const maxMembers = Math.max(1, ...data.team.map((role) => role.memberCount));

  const userDetail = users.total
    ? [
        `${users.active} active`,
        users.invited ? `${users.invited} invited` : null,
        users.suspended ? `${users.suspended} suspended` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No users yet";

  return (
    <PageContainer>
      <PageHeader title="Settings" />
      <SettingsNav permissions={context.permissions} current="/settings" />

      {/* Organization */}
      <section className="relative overflow-hidden rounded-xl border border-border/50 bg-card p-5 shadow-xs sm:p-6 dark:shadow-none">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/[0.06] blur-2xl"
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-semibold tracking-wide text-primary"
            >
              {initials(organization?.name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold tracking-tight">
                  {organization?.name ?? "Organization"}
                </h2>
                <DotBadge tone={organization?.isActive ? "green" : "gray"}>
                  {organization?.isActive ? "Active" : "Inactive"}
                </DotBadge>
              </div>
              {subtitle && (
                <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>

          {meta.length > 0 && (
            <dl className="grid gap-x-8 gap-y-2.5 text-xs sm:grid-cols-2">
              {meta.map(({ key, icon: Icon, value }) => (
                <div key={key} className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{value}</span>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* Figures */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Users"
          value={String(users.total)}
          detail={userDetail}
          icon={Users}
          href={canManageUsers ? "/settings/users" : undefined}
        />
        <StatCard
          label="Roles"
          value={String(roles.total)}
          detail={`${roles.system} system · ${roles.custom} custom`}
          icon={ShieldCheck}
          href={canManageRoles ? "/settings/roles" : undefined}
        />
        <StatCard
          label="Logs"
          value={canViewLogs ? String(data.auditEntries) : "—"}
          detail={
            canViewLogs
              ? data.auditEntries
                ? "Changes recorded"
                : "No changes recorded yet"
              : "No access"
          }
          icon={ScrollText}
          href={canViewLogs ? "/settings/logs" : undefined}
        />
      </div>

      {/* Breakdowns */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {canManageUsers && (
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-sm font-semibold">Team by role</h2>
              <Link
                href="/settings/users"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Manage
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </CardHeader>
            {data.team.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No roles yet.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {data.team.map((role) => (
                  <li key={role.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{role.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {role.isSystem ? "System role" : "Custom role"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div
                        className="h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:w-28"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{
                            width: `${Math.max(
                              4,
                              Math.round((role.memberCount / maxMembers) * 100),
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="w-6 text-right text-sm font-medium tabular-nums">
                        {role.memberCount}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {canViewLogs && (
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-sm font-semibold">Recent activity</h2>
              <Link
                href="/settings/logs"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View logs
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </CardHeader>
            {data.recentActivity.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {data.recentActivity.map((entry) => {
                  const action = auditActionCopy(entry.action);
                  const actor =
                    [entry.actorFirstName, entry.actorLastName].filter(Boolean).join(" ") ||
                    entry.actorEmail ||
                    "System";
                  return (
                    <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                        <UserCheck className="size-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <DotBadge tone={action.tone}>{action.label}</DotBadge>
                          <span className="truncate text-sm font-medium">
                            {auditEntityLabel(entry.entityType)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {actor} ·{" "}
                          {formatDistanceToNowStrict(entry.occurredAt, {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>

      {canViewSystem && <SystemPerformancePanel className="mt-4" />}
    </PageContainer>
  );
}
