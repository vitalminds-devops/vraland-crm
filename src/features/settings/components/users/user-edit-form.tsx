"use client";
import { ExecutivePicker } from "./executive-picker";
import {
  allowsTeamMember,
  assignedBrokerRoles,
  reportsToMasterBroker,
  teamMemberRoles,
} from "@/lib/permissions/team-assignment";

import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  FormField,
  FormRow,
  FormSection,
  FormSelect,
  FormStyle,
  formActionsClass,
  formCardClass,
  formShellClass,
} from "@/components/ui/form-kit";
import { NativeSelectOption } from "@/components/ui/native-select";
import { notify } from "@/components/ui/toast";
import { administratorRoleSlug, superAdministratorRoleSlug } from "@/lib/permissions/catalog";
import { resolveDataScope } from "@/lib/permissions/policy";
import {
  applyPermissionOverrides,
  type PermissionOverride,
} from "@/lib/permissions/user-permissions";

import { updateUserAccess } from "../../actions/settings.actions";
import { updateUserPermissions } from "../../actions/user-permissions.actions";
import { RoleChipToggle, type RoleOption } from "./role-chips";
import { userStatusLabels } from "./status-badge";
import { UserPermissionsPicker } from "./user-permissions-picker";
import { FormNavigation } from "@/components/common/form-navigation";
import { displayName, type UserRow } from "./user-types";

type Draft = {
  status: string;
  brokerId: string;
  roleIds: string[];
};

function draftFromUser(user: UserRow): Draft {
  return {
    status: user.status,
    brokerId: user.brokerId ?? "",
    roleIds: user.roles.map((role) => role.id),
  };
}

function isDirty(a: Draft, b: Draft): boolean {
  return (
    a.status !== b.status ||
    a.brokerId !== b.brokerId ||
    a.roleIds.length !== b.roleIds.length ||
    a.roleIds.some((id) => !b.roleIds.includes(id))
  );
}

export type UserEditFormProps = {
  users: UserRow[];
  user: UserRow;
  roles: RoleOption[];
  brokers: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string;
  }[];
  /** Each role's permission keys and the user's own changes; left out when the viewer may not edit them. */
  permissionEditor?: { roleKeys: Record<string, string[]>; overrides: PermissionOverride[] };
};

/** Edits one user's status, broker, roles, team and permissions on its own page. */
export function UserEditForm({ users, user, roles, brokers, permissionEditor }: UserEditFormProps) {
  const router = useRouter();
  const onClose = () => router.push("/settings/users");
  // Everyone already on this team that the picker manages (agents and sales executives); saving unassigns any left out.
  const memberRoles = teamMemberRoles(user.roles.map((r) => r.slug));
  const initialMembers = users
    .filter((u) => u.brokerId === user.id && u.roles.some((r) => memberRoles.includes(r.slug)))
    .map((u) => u.id);
  const [selected, setSelected] = useState<string[]>(initialMembers);
  // A Master Broker's brokers, edited with the same picker.
  const brokerRoles = assignedBrokerRoles(["master-broker"]);
  const initialBrokers = users
    .filter((u) => u.brokerId === user.id && u.roles.some((r) => brokerRoles.includes(r.slug)))
    .map((u) => u.id);
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>(initialBrokers);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(() => draftFromUser(user));
  const draftRoleSlugs = roles.filter((r) => draft.roleIds.includes(r.id)).map((r) => r.slug);
  const leadsBrokers = draftRoleSlugs.includes("master-broker");
  const eligibleBrokers = [
    // Brokers may report to a Master Broker.
    ...(reportsToMasterBroker(draftRoleSlugs)
      ? users.filter(
          (u) =>
            u.id !== user.id &&
            u.status === "active" &&
            u.roles.some((r) => r.slug === "master-broker"),
        )
      : []),
    ...brokers.filter(
      (broker) =>
        broker.id !== user.id &&
        allowsTeamMember(
          users.find((u) => u.id === broker.id)?.roles.map((r) => r.slug) ?? [],
          draftRoleSlugs,
        ),
    ),
  ];
  // The broker on record stays selectable even when it would not qualify as a new pick
  // (a Master Broker, or someone now inactive), so the dropdown never hides who it is.
  const recorded = users.find((u) => u.id === user.brokerId);
  const keptBroker =
    user.brokerId && !eligibleBrokers.some((broker) => broker.id === user.brokerId)
      ? {
          id: user.brokerId,
          label: recorded
            ? `${displayName(recorded)}${recorded.status === "active" ? "" : " (inactive)"}`
            : "Current broker (archived)",
        }
      : null;
  const baseline = useMemo(() => draftFromUser(user), [user]);
  const [overrides, setOverrides] = useState(permissionEditor?.overrides ?? []);
  const permissionsDirty =
    JSON.stringify(overrides) !== JSON.stringify(permissionEditor?.overrides ?? []);
  const roleKeysOf = (roleIds: string[]) => [
    ...new Set(roleIds.flatMap((id) => permissionEditor?.roleKeys[id] ?? [])),
  ];
  const draftRoleKeys = roleKeysOf(draft.roleIds);
  const dataScopeOf = (roleIds: string[], changes: PermissionOverride[]) =>
    resolveDataScope({ permissions: applyPermissionOverrides(roleKeysOf(roleIds), changes) });
  const [confirm, setConfirm] = useState<
    null | "administrator" | "organization" | "deactivate" | "discard"
  >(null);

  const noRoles = draft.roleIds.length === 0;
  const accessDirty =
    isDirty(draft, baseline) ||
    JSON.stringify([...selected].sort()) !== JSON.stringify([...initialMembers].sort()) ||
    JSON.stringify([...selectedBrokers].sort()) !== JSON.stringify([...initialBrokers].sort());
  const dirty = accessDirty || permissionsDirty;
  // The team pickers render nothing for roles that lead no team, so the section is left out.
  const hasTeam = teamMemberRoles(draftRoleSlugs).length > 0 || leadsBrokers || selected.length > 0;

  const lockedRoleIds = useMemo(
    () =>
      user.roles.filter((role) => role.slug === superAdministratorRoleSlug).map((role) => role.id),
    [user.roles],
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const toggleRole = (roleId: string) => {
    if (lockedRoleIds.includes(roleId)) return;
    setDraft((current) => {
      const selected = current.roleIds.includes(roleId);
      const roleIds = selected
        ? current.roleIds.filter((id) => id !== roleId)
        : [...current.roleIds, roleId];
      return { ...current, roleIds };
    });
  };

  // Prompt before leaving with unsaved edits, and intercept escalation risks.
  const requestClose = () => {
    if (dirty) {
      setConfirm("discard");
      return;
    }
    onClose();
  };

  const submit = () => {
    startTransition(async () => {
      // One call, so access and permissions are saved together or not at all.
      const result = accessDirty
        ? await updateUserAccess({
            id: user.id,
            salesExecutiveIds: selected,
            // Without the Master Broker role, nobody may report to them as a broker.
            brokerIds: leadsBrokers ? selectedBrokers : [],
            status: draft.status,
            brokerId: draft.brokerId,
            roleIds: draft.roleIds,
            ...(permissionsDirty ? { permissionOverrides: overrides } : {}),
          })
        : permissionsDirty
          ? await updateUserPermissions({ userId: user.id, overrides })
          : null;
      if (!result) return;
      if (result.success) {
        notify(`${displayName(user)} saved.`, "success");
        onClose();
        router.refresh();
      } else {
        notify(result.error.message || "Couldn't save.", "error");
      }
    });
  };

  const handleSaveClick = () => {
    if (noRoles) {
      notify("Select at least one role.", "error");
      return;
    }
    const hasRoleSlug = (ids: string[], slug: string) =>
      ids.some((id) => roles.some((role) => role.id === id && role.slug === slug));
    const grantsAdmin = hasRoleSlug(draft.roleIds, administratorRoleSlug);
    const hadAdmin = hasRoleSlug(baseline.roleIds, administratorRoleSlug);
    if (grantsAdmin && !hadAdmin) {
      setConfirm("administrator");
      return;
    }
    // Only warn when roles or permissions *widen* access to every record in the organization.
    const wideningToOrganization =
      permissionEditor !== undefined &&
      dataScopeOf(draft.roleIds, overrides) === "organization" &&
      dataScopeOf(baseline.roleIds, permissionEditor.overrides) !== "organization";
    if (wideningToOrganization) {
      setConfirm("organization");
      return;
    }
    // Only warn when an active account is being taken out of service.
    if (draft.status !== "active" && baseline.status === "active") {
      setConfirm("deactivate");
      return;
    }
    submit();
  };

  const confirmCopy: Record<
    Exclude<NonNullable<typeof confirm>, null>,
    { title: string; body: string; confirmLabel: string; destructive: boolean }
  > = {
    administrator: {
      title: "Grant administrator access?",
      body: `${displayName(user)} will get full access to everything.`,
      confirmLabel: "Grant administrator",
      destructive: true,
    },
    organization: {
      title: "Grant organization-wide access?",
      body: `${displayName(user)} will see every record.`,
      confirmLabel: "Grant full access",
      destructive: true,
    },
    deactivate: {
      title: "Deactivate this user?",
      body: `${displayName(user)} will lose access now.`,
      confirmLabel: "Deactivate",
      destructive: true,
    },
    discard: {
      title: "Discard unsaved changes?",
      body: "Your edits will be lost.",
      confirmLabel: "Discard changes",
      destructive: true,
    },
  };

  const activeConfirm = confirm ? confirmCopy[confirm] : null;
  const runConfirm = () => {
    const action = confirm;
    setConfirm(null);
    if (action === "discard") {
      onClose();
      return;
    }
    submit();
  };

  // Numbered by what is shown, so the side navigation and the headings always agree.
  const sections = [
    { id: "section-account", title: "Account" },
    { id: "section-roles", title: "Roles" },
    ...(hasTeam ? [{ id: "section-team", title: "Team" }] : []),
    ...(permissionEditor ? [{ id: "section-permissions", title: "Permissions" }] : []),
  ].map((section, index) => ({
    ...section,
    number: index + 1,
    label: `${index + 1}. ${section.title}`,
  }));
  const sectionProps = (id: string) => {
    const section = sections.find((s) => s.id === id)!;
    return { id: section.id, number: section.number, title: section.title };
  };

  return (
    <>
      <FormNavigation sections={sections} />
      <div className={formCardClass}>
        <div className={formShellClass}>
          <FormStyle />
          <FormSection {...sectionProps("section-account")}>
            <FormRow>
              <FormField label="Status">
                <FormSelect
                  value={draft.status}
                  onChange={(event) => set("status", event.target.value)}
                >
                  {Object.entries(userStatusLabels)
                    // Invited is set by sending an invite; kept only so a pending invite still shows.
                    .filter(([value]) => value !== "invited" || user.status === "invited")
                    .map(([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {label}
                      </NativeSelectOption>
                    ))}
                </FormSelect>
              </FormField>
              <FormField label="Broker">
                <FormSelect
                  value={draft.brokerId}
                  onChange={(event) => set("brokerId", event.target.value)}
                >
                  <NativeSelectOption value="">No broker</NativeSelectOption>
                  {keptBroker && (
                    <NativeSelectOption value={keptBroker.id}>
                      {keptBroker.label}
                    </NativeSelectOption>
                  )}
                  {eligibleBrokers.map((broker) => (
                    <NativeSelectOption key={broker.id} value={broker.id}>
                      {`${broker.firstName} ${broker.lastName ?? ""}`.trim()}
                    </NativeSelectOption>
                  ))}
                </FormSelect>
              </FormField>
            </FormRow>
          </FormSection>
          <FormSection {...sectionProps("section-roles")}>
            <div className="grid gap-2">
              <RoleChipToggle
                roles={roles}
                selectedIds={draft.roleIds}
                onToggle={toggleRole}
                disabledRoleIds={lockedRoleIds}
              />
              {noRoles && <p className="text-xs text-destructive">Select at least one role.</p>}
            </div>
          </FormSection>
          {hasTeam && (
            <FormSection {...sectionProps("section-team")}>
              <div className="grid gap-2">
                <ExecutivePicker
                  users={users}
                  managerId={user.id}
                  managerRoles={roles
                    .filter((r) => draft.roleIds.includes(r.id))
                    .map((r) => r.slug)}
                  selected={selected}
                  onChange={setSelected}
                />
                {leadsBrokers && (
                  <ExecutivePicker
                    users={users}
                    managerId={user.id}
                    managerRoles={draftRoleSlugs}
                    selected={selectedBrokers}
                    onChange={setSelectedBrokers}
                    kind="brokers"
                  />
                )}
              </div>
            </FormSection>
          )}
          {permissionEditor && (
            <FormSection {...sectionProps("section-permissions")}>
              <UserPermissionsPicker
                userId={user.id}
                roleKeys={draftRoleKeys}
                overrides={overrides}
                onChange={setOverrides}
              />
            </FormSection>
          )}
          <div className={formActionsClass}>
            <p className="text-xs text-muted-foreground">
              {dirty ? "Unsaved changes" : "No changes yet"}
            </p>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={requestClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSaveClick}
                disabled={pending || !dirty || noRoles}
              >
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {activeConfirm && (
        <Dialog
          open={confirm !== null}
          onOpenChange={(next) => {
            if (!next) setConfirm(null);
          }}
        >
          <DialogPortal>
            <DialogOverlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm fixed inset-0 z-[60] grid place-items-center overflow-y-auto p-4">
              <DialogPopup className="w-full max-w-md rounded-xl border border-border/60 bg-card p-5 shadow-2xl">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-content-center rounded-full bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-base font-semibold">
                      {activeConfirm.title}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-muted-foreground">
                      {activeConfirm.body}
                    </DialogDescription>
                  </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirm(null)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant={activeConfirm.destructive ? "danger" : "primary"}
                    onClick={runConfirm}
                    disabled={pending}
                  >
                    {activeConfirm.confirmLabel}
                  </Button>
                </div>
              </DialogPopup>
            </DialogOverlay>
          </DialogPortal>
        </Dialog>
      )}
    </>
  );
}
