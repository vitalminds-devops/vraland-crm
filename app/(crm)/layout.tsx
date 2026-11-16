import { CrmShell } from "@/components/layout/crm-shell";
import { crmNavigation } from "@/components/layout/navigation";
import {
  getAuthorizationContext,
  getCurrentOrganization,
  getCurrentUser,
} from "@/lib/permissions/authorization";
import {
  canManageBilling,
  canViewBilling,
  canViewTeam,
  hasPermission,
} from "@/lib/permissions/policy";
import { redirect } from "next/navigation";
import { avatarSrc } from "@/features/account/lib/avatar";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");
  const [user, organization] = await Promise.all([getCurrentUser(), getCurrentOrganization()]);
  const navigation = crmNavigation.filter((item) =>
    item.href === "/billing"
      ? canViewBilling(context)
      : item.href === "/payments"
        ? canManageBilling(context)
        : item.href === "/my-team"
          ? canViewTeam(context)
          : (typeof item.permission === "string" ? [item.permission] : item.permission).some(
              (permission) => hasPermission(context, permission),
            ),
  );
  const name = `${user.firstName} ${user.lastName}`;
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  return (
    <CrmShell
      navigation={navigation}
      user={{
        name,
        initials,
        avatar: avatarSrc(user.id, user.avatarUrl),
        role: context.roles[0]?.replaceAll("-", " ") ?? "Team member",
      }}
      organization={organization.name}
    >
      {children}
    </CrmShell>
  );
}
