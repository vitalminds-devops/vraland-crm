"use client";

import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Archive, ArrowLeft, UserCheck, UserPlus, UserX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { PageHeader } from "@/components/common/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardToolbar } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify } from "@/components/ui/toast";
import { agentRoleSlug, roleLabel, superAdministratorRoleSlug } from "@/lib/permissions/catalog";

import { setUserDeleted, setUserStatus } from "../actions/settings.actions";
import { AgentCreateForm, CreateUserForm } from "./settings-forms";
import { SettingsNav } from "./settings-nav";
import { UserProfileDialog } from "./users/user-profile-dialog";
import { UsersTable, type SortDir, type SortKey } from "./users/users-table";
import { UsersToolbar } from "./users/users-toolbar";
import { displayName, type BrokerOption, type RoleRef, type UserRow } from "./users/user-types";

/** Headings for the create-user role picker; roles not listed fall under "Other". */
const roleGroups: { label: string; slugs: readonly string[] }[] = [
  { label: "Administration", slugs: ["administrator", "viewer"] },
  {
    label: "Management",
    slugs: ["master-broker", "sales-manager", "sales-director-ih"],
  },
  { label: "Brokers & agents", slugs: ["broker", "license-broker", "agent"] },
  {
    label: "In-house (IH)",
    slugs: ["network-partner-ih", "sales-executive-ih", "consultant-ih"],
  },
  {
    label: "Independent sales",
    slugs: ["network-partner-ind", "sales-executive", "sales-executive-ind"],
  },
];

/** The status change a confirmation is waiting on. */
type StatusChange = {
  user: UserRow;
  next: "active" | "inactive" | "deleted";
};

export function UsersWorkspace({
  users,
  currentUserId,
  roles,
  brokers,
  permissions,
}: {
  users: UserRow[];
  /** The signed-in user's own id, so their row can be made read-only. */
  currentUserId: string;
  roles: RoleRef[];
  brokers: BrokerOption[];
  permissions: string[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  // Role picked in step one of the create dialog; null shows the role picker.
  const [createRole, setCreateRole] = useState<RoleRef | null>(null);
  const creatableRoles = roles.filter((role) => role.slug !== superAdministratorRoleSlug);
  const groupedSlugs = new Set(roleGroups.flatMap((group) => group.slugs));
  const creatableRoleGroups = [
    ...roleGroups.map((group) => ({
      label: group.label,
      roles: group.slugs.flatMap((slug) => creatableRoles.find((role) => role.slug === slug) ?? []),
    })),
    {
      label: "Other",
      roles: creatableRoles.filter((role) => !groupedSlugs.has(role.slug)),
    },
  ].filter((group) => group.roles.length > 0);
  const openCreate = () => {
    setCreateRole(null);
    setCreating(true);
  };
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [roleId, setRoleId] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey | null>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusChange, setStatusChange] = useState<StatusChange | null>(null);
  const [statusPending, startStatusChange] = useTransition();
  const [handoverTo, setHandoverTo] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showAdditionalColumns, setShowAdditionalColumns] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const roleOptions = roles.map((role) => ({
    ...role,
    count: users.filter((user) => user.roles.some((assignedRole) => assignedRole.id === role.id))
      .length,
  }));
  const noRoleCount = users.filter((user) => user.roles.length === 0).length;
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const user of users) {
      counts.set(user.status, (counts.get(user.status) ?? 0) + 1);
    }
    return counts;
  }, [users]);

  const normalizedSearch = search.trim().toLowerCase();
  const visibleUsers = users.filter((user) => {
    const matchesSearch =
      !normalizedSearch ||
      `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(normalizedSearch);
    const matchesStatus = status === "all" || user.status === status;
    const matchesRole =
      roleId === "all" ||
      (roleId === "none" ? user.roles.length === 0 : user.roles.some((role) => role.id === roleId));
    return matchesSearch && matchesStatus && matchesRole;
  });

  const sortedUsers = useMemo(() => {
    if (!sortKey) return visibleUsers;
    const direction = sortDir === "asc" ? 1 : -1;
    const value = (user: UserRow): string => {
      if (sortKey === "name") return `${user.firstName} ${user.lastName}`.toLowerCase();
      return user.status.toLowerCase();
    };
    return [...visibleUsers].sort((a, b) => value(a).localeCompare(value(b)) * direction);
  }, [visibleUsers, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(sortedUsers.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pagedUsers = sortedUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const hasActiveFilters = Boolean(search) || status !== "all" || roleId !== "all";

  const viewingUser = users.find((user) => user.id === viewingId) ?? null;

  const clearFilters = () => {
    setPage(1);
    setSearch("");
    setStatus("all");
    setRoleId("all");
  };

  const toggleSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const refreshAndClose = () => {
    setCreating(false);
    router.refresh();
  };

  const copyValue = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(successMessage, "success");
    } catch {
      notify("Couldn't copy.", "error");
    }
  };

  const copyEmail = (user: UserRow) => copyValue(user.email, "Email copied");
  const copyId = (user: UserRow) => copyValue(user.id, "User ID copied");
  const copyPhone = (user: UserRow) => copyValue(user.phone ?? "", "Phone number copied");

  const brokerNameFor = (user: UserRow) => {
    // From every user, not just the broker picker list, so a Master Broker lead shows too.
    const broker = users.find((item) => item.id === user.brokerId);
    return broker ? `${broker.firstName} ${broker.lastName ?? ""}`.trim() : null;
  };

  const openProfile = (user: UserRow) => setViewingId(user.id);
  const editUser = (user: UserRow) => router.push(`/settings/users/${user.id}`);
  const editFromProfile = (user: UserRow) => {
    setViewingId(null);
    editUser(user);
  };

  const handleDeactivate = (user: UserRow) => setStatusChange({ user, next: "inactive" });
  const handleReactivate = (user: UserRow) => setStatusChange({ user, next: "active" });
  const handleDelete = permissions.includes("users.delete")
    ? (user: UserRow) => setStatusChange({ user, next: "deleted" })
    : undefined;

  const confirmStatusChange = () => {
    const change = statusChange;
    if (!change) return;
    startStatusChange(async () => {
      const handoverToUserId = handoverTo;
      const result =
        change.next === "deleted"
          ? await setUserDeleted({ id: change.user.id, deleted: true, handoverToUserId })
          : await setUserStatus({ id: change.user.id, status: change.next, handoverToUserId });
      // Kept open on failure, so a missing handover can be picked and retried.
      if (!result.success) {
        notify(result.error.message || "Couldn't update the user.", "error");
        return;
      }
      setStatusChange(null);
      setHandoverTo("");
      notify(
        {
          inactive: `${displayName(change.user)} deactivated`,
          active: `${displayName(change.user)} reactivated`,
          deleted: `${displayName(change.user)} archived`,
        }[change.next],
        "success",
      );
      router.refresh();
    });
  };
  const handoverOptions = statusChange
    ? users.filter((user) => user.status === "active" && user.id !== statusChange.user.id)
    : [];

  const statusCopy = statusChange
    ? statusChange.next === "deleted"
      ? {
          title: "Archive this user?",
          body: `${displayName(statusChange.user)} will be signed out. Records are kept.`,
          confirmLabel: "Archive",
          destructive: true,
        }
      : statusChange.next === "inactive"
        ? {
            title: "Deactivate this user?",
            body: `${displayName(statusChange.user)} won't be able to sign in.`,
            confirmLabel: "Deactivate",
            destructive: true,
          }
        : {
            title: "Reactivate this user?",
            body: `${displayName(statusChange.user)} will be able to sign in again.`,
            confirmLabel: "Reactivate",
            destructive: false,
          }
    : null;

  return (
    <>
      <PageHeader
        title="Users"
        description="Accounts, roles and brokers."
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <ButtonLink
              href="/settings/users/organization-chart"
              variant="secondary"
              className="h-10 gap-2"
            >
              Organization chart
            </ButtonLink>
            {permissions.includes("users.restore") && (
              <ButtonLink
                href="/settings/archived-users"
                variant="secondary"
                className="h-10 gap-2"
              >
                <Archive aria-hidden="true" size={16} />
                Archived users
              </ButtonLink>
            )}
            <Button type="button" variant="primary" className="h-10 gap-2" onClick={openCreate}>
              <UserPlus aria-hidden="true" size={16} />
              Create user
            </Button>
          </div>
        }
      />

      <SettingsNav permissions={new Set(permissions)} current="/settings/users" />

      <Card className="mt-6">
        <CardToolbar>
          <UsersToolbar
            search={search}
            onSearchChange={(value) => {
              setPage(1);
              setSearch(value);
            }}
            status={status}
            onStatusChange={(value) => {
              setPage(1);
              setStatus(value);
            }}
            statusCounts={statusCounts}
            roleId={roleId}
            onRoleChange={(value) => {
              setPage(1);
              setRoleId(value);
            }}
            roleOptions={roleOptions}
            totalCount={users.length}
            noRoleCount={noRoleCount}
            visibleCount={sortedUsers.length}
            onClearFilters={clearFilters}
            isDirty={false}
          />
        </CardToolbar>

        <CardContent className="p-0">
          <UsersTable
            users={pagedUsers}
            currentUserId={currentUserId}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
            onCreateUser={openCreate}
            onEdit={editUser}
            onViewProfile={openProfile}
            onDeactivate={handleDeactivate}
            onReactivate={handleReactivate}
            onDelete={handleDelete}
            onCopyEmail={copyEmail}
            onCopyId={copyId}
            onCopyPhone={copyPhone}
            selectedIds={new Set()}
            onToggleSelect={() => {}}
            onToggleSelectAll={() => {}}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            showSelection={false}
            showAdditionalColumns={showAdditionalColumns}
            onToggleColumns={() => setShowAdditionalColumns((value) => !value)}
            page={currentPage}
            pages={pages}
            pageSize={pageSize}
            onPageChange={(next) => setPage(Math.min(Math.max(1, next), pages))}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>

      {viewingUser && (
        <UserProfileDialog
          key={viewingUser.id}
          user={viewingUser}
          open
          onClose={() => setViewingId(null)}
          brokerName={brokerNameFor(viewingUser)}
          onEdit={editFromProfile}
        />
      )}

      {statusChange && statusCopy && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next && !statusPending) {
              setStatusChange(null);
              setHandoverTo("");
            }
          }}
        >
          <DialogPortal>
            <DialogOverlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm fixed inset-0 z-[60] grid place-items-center overflow-y-auto p-4">
              <DialogPopup className="w-full max-w-md rounded-xl border border-border/60 bg-card p-5 shadow-2xl">
                <div className="flex items-start gap-3">
                  <div
                    className={
                      statusCopy.destructive
                        ? "grid size-9 shrink-0 place-content-center rounded-full bg-destructive/10 text-destructive"
                        : "grid size-9 shrink-0 place-content-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    }
                  >
                    {statusChange.next === "deleted" ? (
                      <Archive className="size-4" aria-hidden="true" />
                    ) : statusCopy.destructive ? (
                      <UserX className="size-4" aria-hidden="true" />
                    ) : (
                      <UserCheck className="size-4" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-base font-semibold">
                      {statusCopy.title}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-muted-foreground">
                      {statusCopy.body}
                    </DialogDescription>
                  </div>
                </div>
                {statusChange.next !== "active" ? (
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Hand over their contacts, deals and team to
                    </span>
                    <NativeSelect
                      value={handoverTo}
                      onChange={(event) => setHandoverTo(event.target.value)}
                      className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 pr-9 text-sm"
                    >
                      <NativeSelectOption value="">
                        Nobody (only if they have none)
                      </NativeSelectOption>
                      {handoverOptions.map((user) => (
                        <NativeSelectOption key={user.id} value={user.id}>
                          {displayName(user)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </label>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setStatusChange(null);
                      setHandoverTo("");
                    }}
                    disabled={statusPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant={statusCopy.destructive ? "danger" : "primary"}
                    onClick={confirmStatusChange}
                    disabled={statusPending}
                  >
                    {statusPending ? "Saving…" : statusCopy.confirmLabel}
                  </Button>
                </div>
              </DialogPopup>
            </DialogOverlay>
          </DialogPortal>
        </Dialog>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
            <DialogPopup className="relative max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-lg bg-card p-5 shadow-xl">
              <header className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-2">
                  {createRole && (
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      aria-label="Change role"
                      onClick={() => setCreateRole(null)}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
                    >
                      <ArrowLeft aria-hidden="true" size={16} />
                    </Button>
                  )}
                  <div>
                    <DialogTitle className="text-lg font-semibold">
                      {createRole
                        ? `Create ${roleLabel(createRole.slug, createRole.name)}`
                        : "Create user"}
                    </DialogTitle>
                    {!createRole && (
                      <DialogDescription className="mt-1 text-sm text-muted-foreground">
                        Pick a role.
                      </DialogDescription>
                    )}
                  </div>
                </div>
                <DialogClose
                  aria-label="Close dialog"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
                >
                  <X aria-hidden="true" size={16} />
                </DialogClose>
              </header>
              {!createRole ? (
                <div className="space-y-4">
                  {creatableRoleGroups.map((group) => (
                    <section key={group.label}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.roles.map((role) => (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => setCreateRole(role)}
                            className="rounded-md border px-4 py-3 text-left text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            {roleLabel(role.slug, role.name)}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : createRole.slug === agentRoleSlug ? (
                <AgentCreateForm brokers={brokers} inModal onCreated={refreshAndClose} />
              ) : (
                <CreateUserForm
                  users={users}
                  key={createRole.id}
                  role={createRole}
                  brokers={brokers}
                  inModal
                  onCreated={refreshAndClose}
                />
              )}
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>
    </>
  );
}
