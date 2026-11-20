"use client";
import {
  allowsTeamMember,
  reportsToMasterBroker,
  teamMemberRoles,
} from "@/lib/permissions/team-assignment";
import { ExecutivePicker } from "./users/executive-picker";
import type { UserRow } from "./users/user-types";

import { Check, Eye, EyeOff, Search, Upload, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify, notifyLoading } from "@/components/ui/toast";
import { documentFileError } from "@/lib/storage/document-validation";
import {
  isAdministratorRoleSlug,
  masterBrokerRoleSlug,
  isBrokerAccessRoleSlug,
  isBrokerRoleSlug,
  moduleLabel,
  permissionCatalog,
  permissionKeys,
  permissionMetadata,
  type PermissionKey,
} from "@/lib/permissions/catalog";
import { permissionDetails, type PermissionDetail } from "@/lib/permissions/permission-details";
import type { ActionResult } from "@/lib/types/action-result";
import { fieldErrorsOf } from "@/lib/types/action-result.client";
import { PermissionDetailTooltip } from "./permission-detail-tooltip";
import type { RoleRef } from "./users/user-types";
import { createAgentAccount, createUser } from "../actions/settings.actions";
import { withoutEmptyFiles } from "../lib/form-files";

type BrokerOption = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
};
// Clear labels and roomy fields: the create forms are used by people of every age.
const input = "h-10 min-w-0 w-full rounded-lg border bg-background px-3 text-sm";
const formField = "grid min-w-0 gap-1.5 text-sm font-medium";

/** Visual marker for a required field; the input's `required` covers screen readers. */
function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

/** A random 16-character password without look-alike characters. */
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const values = crypto.getRandomValues(new Uint32Array(16));
  return Array.from(values, (value) => chars[value % chars.length]).join("");
}

/** Password field with a show/hide toggle and a Generate button. */
function PasswordInput() {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  return (
    <div className="flex min-w-0 gap-2">
      <div className="relative min-w-0 flex-1">
        <Input
          required
          type={visible ? "text" : "password"}
          name="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={`${input} pr-10`}
        />
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        >
          {visible ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
        </button>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="h-10 shrink-0 gap-1.5 px-3 text-primary"
        onClick={() => {
          setValue(generatePassword());
          setVisible(true);
        }}
      >
        <Wand2 aria-hidden="true" className="size-4" />
        Generate
      </Button>
    </div>
  );
}

/** One numbered step of a create form: a big title, one line of help, then its fields. */
function Step({
  number,
  title,
  hint,
  children,
}: {
  number: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="grid gap-3 rounded-xl border bg-card p-4">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
        >
          {number}
        </span>
        <div>
          <p className="text-[15px] leading-6 font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </fieldset>
  );
}

/** An upload box for the user's documents that lists what was picked. */
function DocumentsField({ label }: { label: string }) {
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <label className="relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-primary/30">
        <Upload aria-hidden="true" className="size-5 text-primary" />
        <span className="text-sm font-semibold text-foreground">Click here to choose files</span>
        <span className="text-xs text-muted-foreground">
          PDF, DOCX, JPG, PNG or TXT · up to 5 files · 15 MB each
        </span>
        <input
          type="file"
          name="documents"
          accept=".pdf,.docx,.jpg,.jpeg,.png,.txt"
          multiple
          aria-label={label}
          onChange={async (event) => {
            setError(null);
            const input = event.currentTarget;
            const selected = Array.from(input.files ?? []);
            let error = selected.length > 5 ? "Upload no more than 5 documents." : null;
            for (const file of selected) {
              error ??= await documentFileError(file);
            }
            if (error) {
              input.value = "";
              setFiles([]);
              setError(error);
              notify(error, "error");
              return;
            }
            setFiles(selected.map((file) => file.name));
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <ul className="grid gap-1.5">
          {files.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2 truncate rounded-md bg-primary/10 px-2.5 py-1.5 text-sm text-primary"
            >
              <Check aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Name and phone: step 1 of both create forms. */
function PersonFields() {
  return (
    <>
      <label className={formField}>
        <span>
          First name
          <RequiredMark />
        </span>
        <Input required name="firstName" placeholder="e.g. Juan" className={input} />
      </label>
      <label className={formField}>
        <span>
          Last name
          <RequiredMark />
        </span>
        <Input required name="lastName" placeholder="e.g. Dela Cruz" className={input} />
      </label>
      <label className={formField}>
        <span>
          Phone <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <Input name="phone" type="tel" placeholder="e.g. 0917 123 4567" className={input} />
      </label>
    </>
  );
}

/** Email and password: how the new person signs in. */
function SignInFields() {
  return (
    <>
      <label className={formField}>
        <span>
          Email
          <RequiredMark />
        </span>
        <Input
          required
          type="email"
          name="email"
          placeholder="e.g. juan@email.com"
          className={input}
        />
      </label>
      <label className={formField}>
        <span>
          Password
          <RequiredMark />
        </span>
        <PasswordInput />
        <span className="font-normal text-muted-foreground">
          At least 12 characters. Tap Generate to make one.
        </span>
      </label>
    </>
  );
}

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const toastId = notifyLoading("Saving account and documents…", "save-account");
      try {
        const result = await fn();
        notify(
          result.success ? "Account saved." : "Account was not saved",
          result.success ? "success" : "error",
          {
            id: toastId,
            description: result.success
              ? undefined
              : Object.values(fieldErrorsOf(result)).flat().join("\n") || result.error.message,
          },
        );
      } catch {
        notify(
          "Save confirmation was not received. Check the user list before submitting again.",
          "error",
          toastId,
        );
      }
    });
  return { pending, run };
}

export function CreateUserForm({
  users = [],
  role,
  brokers,
  inModal = false,
  onCreated,
}: {
  users?: UserRow[];
  /** Picked before the form opens; the account gets exactly this role. */
  role: RoleRef;
  brokers: BrokerOption[];
  inModal?: boolean;
  onCreated?: () => void;
}) {
  const action = useAction();
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>([]);
  const brokerSelected = isBrokerRoleSlug(role.slug);
  // Brokers report to a Master Broker; Master Brokers have nobody above them.
  const underMasterBroker = reportsToMasterBroker([role.slug]);
  const showBroker =
    !isAdministratorRoleSlug(role.slug) &&
    role.slug !== masterBrokerRoleSlug &&
    (underMasterBroker ||
      !isBrokerAccessRoleSlug(role.slug) ||
      role.slug.startsWith("sales-executive"));
  const leads = underMasterBroker
    ? users.filter(
        (user) =>
          user.status === "active" && user.roles.some((r) => r.slug === masterBrokerRoleSlug),
      )
    : brokers.filter((broker) =>
        allowsTeamMember(
          users.find((user) => user.id === broker.id)?.roles.map((r) => r.slug) ?? [],
          [role.slug],
        ),
      );
  const showTeam = teamMemberRoles([role.slug]).length > 0 || role.slug === "master-broker";
  return (
    <form
      className={`grid gap-5 ${inModal ? "" : "rounded-xl border bg-muted/20 p-5"}`}
      onSubmit={(event) => {
        event.preventDefault();
        const element = event.currentTarget;
        const form = new FormData(element);
        withoutEmptyFiles(form);
        form.set("salesExecutivesPresent", "true");
        selected.forEach((id) => form.append("salesExecutiveIds", id));
        if (role.slug === "master-broker") {
          selectedBrokers.forEach((id) => form.append("brokerIds", id));
        }
        action.run(async () => {
          const result = await createUser(form);
          if (result.success) {
            element.reset();
            setSelected([]);
            setSelectedBrokers([]);
            onCreated?.();
          }
          return result;
        });
      }}
    >
      {!inModal && <h2 className="text-lg font-semibold">Create user</h2>}
      <Step number={1} title="About this person" hint="Their name as it will show in the CRM.">
        <PersonFields />
      </Step>
      <Step number={2} title="How they sign in" hint="Give them this email and password.">
        <SignInFields />
      </Step>
      {showBroker && (
        <Step
          number={3}
          title="Who they report to"
          hint={`Choose their ${underMasterBroker ? "master broker" : "broker"}, if they have one.`}
        >
          <label className={formField}>
            {underMasterBroker ? "Master broker" : "Broker"}
            <NativeSelect name="brokerId" className={`${input} pr-9`}>
              <NativeSelectOption value="">
                {underMasterBroker ? "No master broker" : "No broker"}
              </NativeSelectOption>
              {leads.map((lead) => (
                <NativeSelectOption key={lead.id} value={lead.id}>
                  {lead.firstName} {lead.lastName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </Step>
      )}
      {showTeam && (
        <Step
          number={showBroker ? 4 : 3}
          title="Their team (optional)"
          hint="People who report to them. You can skip this and add them later."
        >
          <ExecutivePicker
            users={users}
            managerRoles={[role.slug]}
            selected={selected}
            onChange={setSelected}
            creating
          />
          {role.slug === "master-broker" && (
            <ExecutivePicker
              users={users}
              managerRoles={[role.slug]}
              selected={selectedBrokers}
              onChange={setSelectedBrokers}
              kind="brokers"
            />
          )}
        </Step>
      )}
      <input type="hidden" name="roleIds" value={role.id} />
      {brokerSelected && (
        <Step
          number={2 + Number(showBroker) + Number(showTeam) + 1}
          title="Documents"
          hint="Optional. ID, license or contract."
        >
          <DocumentsField label="Broker documents" />
        </Step>
      )}
      <Button
        type="submit"
        variant="primary"
        className="h-11 w-full font-semibold"
        disabled={action.pending}
      >
        {action.pending ? "Saving…" : "Create account"}
      </Button>
    </form>
  );
}

export function AgentCreateForm({
  brokers = [],
  inModal = false,
  onCreated,
}: {
  brokers?: BrokerOption[];
  inModal?: boolean;
  onCreated?: () => void;
}) {
  const action = useAction();
  const router = useRouter();
  return (
    <form
      className={`grid gap-5 ${inModal ? "" : "rounded-xl border bg-muted/20 p-5"}`}
      onSubmit={(event) => {
        event.preventDefault();
        const element = event.currentTarget;
        const form = new FormData(element);
        withoutEmptyFiles(form);
        action.run(async () => {
          const result = await createAgentAccount(form);
          if (result.success) {
            element.reset();
            if (onCreated) onCreated();
            else router.push("/settings/users");
          }
          return result;
        });
      }}
    >
      <Step number={1} title="About this person" hint="Their name as it will show in the CRM.">
        <PersonFields />
      </Step>
      <Step number={2} title="How they sign in" hint="Give them this email and password.">
        <SignInFields />
      </Step>
      <Step number={3} title="Who they report to" hint="Choose their broker, if they have one.">
        <label className={formField}>
          Broker
          <NativeSelect name="brokerId" defaultValue="" className={`${input} pr-9`}>
            <NativeSelectOption value="">No broker</NativeSelectOption>
            {brokers.map((broker) => (
              <NativeSelectOption key={broker.id} value={broker.id}>
                {broker.firstName} {broker.lastName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </Step>
      <Step number={4} title="Documents" hint="Optional. ID, license or contract.">
        <DocumentsField label="Agent documents" />
      </Step>
      <Button
        type="submit"
        variant="primary"
        className="h-11 w-full font-semibold"
        disabled={action.pending}
      >
        {action.pending ? "Saving…" : "Create account"}
      </Button>
    </form>
  );
}

const moduleOrder = Object.keys(permissionCatalog);

function permissionCopy(key: string): { label: string; description: string } {
  return permissionMetadata[key as PermissionKey] ?? { label: key, description: "" };
}

function permissionDetail(key: string): PermissionDetail | undefined {
  return permissionDetails[key as PermissionKey];
}

/** The permission checkboxes for one role; the Roles page holds the edits and saves every role at once. */
export function RolePermissionsPicker({
  roleId,
  permissions,
  checked,
  onChange,
  disabled = false,
}: {
  roleId: string;
  permissions: { key: string; module: string }[];
  /** The keys ticked now, saved or not. */
  checked: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => groupPermissions(permissions), [permissions]);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? groups
        .map((group) => ({
          ...group,
          rows: group.rows.filter((row) => {
            const copy = permissionCopy(row.key);
            return (
              row.key.toLowerCase().includes(needle) ||
              copy.label.toLowerCase().includes(needle) ||
              copy.description.toLowerCase().includes(needle) ||
              permissionDetail(row.key)?.conditions.some((c) => c.toLowerCase().includes(needle))
            );
          }),
        }))
        .filter((group) => group.rows.length > 0)
    : groups;

  function toggle(key: string) {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  function setGroup(keys: string[], on: boolean) {
    const next = new Set(checked);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  }

  return (
    <div>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="relative min-w-[16rem] flex-1 sm:max-w-xs">
            <span className="sr-only">Filter permissions</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter permissions…"
              className="h-10 w-full rounded-lg border border-border/60 bg-background pl-9 pr-3 text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </label>
          <span className="text-xs text-muted-foreground">
            {checked.size} of {permissions.length} granted
          </span>
        </div>

        {/* Columns fit the card, not the window: the user page's card is much narrower than the Roles page. */}
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4">
          {visible.map((group) => {
            const keys = group.rows.map((row) => row.key);
            const on = keys.filter((key) => checked.has(key)).length;
            const allOn = on === keys.length;
            return (
              <fieldset
                key={group.module}
                // A fieldset never shrinks below its content by default, which pushed groups into each other.
                className="min-w-0 rounded-lg border border-border/60 p-3"
              >
                <legend className="px-1 text-[13px] font-semibold text-foreground">
                  {group.label}
                </legend>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {on} of {keys.length}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setGroup(keys, !allOn)}
                    className="rounded text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:hidden"
                  >
                    {allOn ? "Clear all" : "Select all"}
                  </button>
                </div>
                <ul className="mt-2 space-y-2">
                  {group.rows.map((row) => {
                    const copy = permissionCopy(row.key);
                    const detail = permissionDetail(row.key);
                    const id = `perm-${roleId}-${row.key}`;
                    return (
                      <li
                        key={row.key}
                        className="flex items-start gap-1 rounded-md transition-colors hover:bg-muted/50"
                      >
                        <label
                          htmlFor={id}
                          className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 p-1.5"
                        >
                          <Checkbox
                            id={id}
                            checked={checked.has(row.key)}
                            disabled={disabled}
                            onCheckedChange={() => toggle(row.key)}
                            className="mt-0.5 size-4 shrink-0 accent-primary"
                          />
                          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                            <span className="text-[13px] font-medium text-foreground">
                              {copy.label}
                            </span>
                            {detail?.unused && (
                              <span className="text-[11px] text-muted-foreground">
                                Not used yet
                              </span>
                            )}
                            <code className="font-mono text-[10px] text-muted-foreground/70">
                              {row.key}
                            </code>
                          </span>
                        </label>
                        {detail && <PermissionDetailTooltip label={copy.label} detail={detail} />}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
        </div>

        {needle && !visible.length && (
          <p className="mt-4 text-sm text-muted-foreground">No matches.</p>
        )}
      </div>
    </div>
  );
}

/** Permission rows bucketed by module, in the catalog's order. */
function groupPermissions(permissions: { key: string; module: string }[]) {
  const byModule = new Map<string, typeof permissions>();
  for (const row of permissions) {
    const bucket = byModule.get(row.module);
    if (bucket) bucket.push(row);
    else byModule.set(row.module, [row]);
  }
  const rank = (module: string) => {
    const index = moduleOrder.indexOf(module);
    return index === -1 ? moduleOrder.length : index;
  };
  return [...byModule.entries()]
    .map(([module, rows]) => ({
      module,
      label: moduleLabel(module),
      rows: [...rows].sort((x, y) => keyRank(x.key) - keyRank(y.key) || x.key.localeCompare(y.key)),
    }))
    .sort((x, y) => rank(x.module) - rank(y.module));
}

function keyRank(key: string): number {
  const index = (permissionKeys as readonly string[]).indexOf(key);
  return index === -1 ? permissionKeys.length : index;
}
