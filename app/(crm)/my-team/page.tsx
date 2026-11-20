import { ContactRound, KanbanSquare, UserCheck, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card } from "@/components/ui/card";
import { DotBadge, type DotBadgeTone } from "@/components/ui/dot-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { manilaDateTime } from "@/lib/utils/manila-time";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { avatarSrc } from "@/features/account/lib/avatar";
import { listMyTeam } from "@/features/team/queries/team.queries";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { canViewTeam } from "@/lib/permissions/policy";

const statusTone: Record<string, DotBadgeTone> = {
  active: "green",
  invited: "amber",
  suspended: "amber",
  deactivated: "gray",
};

/** A Broker's own team: everyone who reports to them. */
export default async function MyTeamPage() {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");
  if (!canViewTeam(context)) redirect("/forbidden");
  const team = await listMyTeam();
  const active = team.filter((member) => member.status === "active").length;
  const leads = team.reduce((sum, member) => sum + member.leads, 0);
  const open = team.reduce((sum, member) => sum + member.openOpportunities, 0);

  return (
    <PageContainer>
      <PageHeader title="My team" description="People who report to you." />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="People"
          value={team.length.toLocaleString()}
          detail="Reporting to you"
          icon={UsersRound}
        />
        <StatCard
          label="Active"
          value={active.toLocaleString()}
          detail={team.length - active ? `${team.length - active} inactive` : "All active"}
          icon={UserCheck}
        />
        <StatCard
          label="Leads"
          value={leads.toLocaleString()}
          detail="Assigned to your team"
          icon={ContactRound}
        />
        <StatCard
          label="Open opportunities"
          value={open.toLocaleString()}
          detail="In progress"
          icon={KanbanSquare}
        />
      </div>

      <Card className="mt-6">
        {team.length ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-4 sm:px-6">
              <h2 className="text-base font-semibold">Team members</h2>
              <span className="text-sm text-muted-foreground tabular-nums">
                {team.length} {team.length === 1 ? "person" : "people"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table className="w-full text-left text-sm">
                <TableHeader className="bg-muted/40 text-[11px] tracking-wide text-muted-foreground uppercase">
                  <TableRow>
                    <TableHead className="px-4 py-3 sm:px-6">Name</TableHead>
                    <TableHead className="hidden px-4 py-3 md:table-cell">Contact</TableHead>
                    <TableHead className="px-4 py-3 text-right">Leads</TableHead>
                    <TableHead className="px-4 py-3 text-right">Open opportunities</TableHead>
                    <TableHead className="hidden px-4 py-3 lg:table-cell">Last sign-in</TableHead>
                    <TableHead className="px-4 py-3">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/40">
                  {team.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="px-4 py-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <InitialsAvatar
                            initials={`${member.firstName[0] ?? ""}${member.lastName[0] ?? ""}`.toUpperCase()}
                            src={avatarSrc(member.id, member.avatarUrl)}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {member.firstName} {member.lastName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {member.roleNames ?? "No role"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden px-4 py-4 md:table-cell">
                        <a
                          href={`mailto:${member.email}`}
                          className="block truncate text-primary hover:underline"
                        >
                          {member.email}
                        </a>
                        {member.phone && (
                          <a
                            href={`tel:${member.phone}`}
                            className="block text-xs text-muted-foreground hover:underline"
                          >
                            {member.phone}
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right tabular-nums">
                        {member.leads}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right tabular-nums">
                        {member.openOpportunities}
                      </TableCell>
                      <TableCell className="hidden px-4 py-4 text-muted-foreground lg:table-cell">
                        {member.lastLoginAt ? manilaDateTime(member.lastLoginAt) : "Never"}
                      </TableCell>
                      <TableCell className="px-4 py-4 sm:pr-6">
                        <DotBadge tone={statusTone[member.status] ?? "gray"}>
                          {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                        </DotBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <EmptyState
            icon={UsersRound}
            title="No team members yet"
            description="No one reports to you."
          />
        )}
      </Card>
    </PageContainer>
  );
}
