"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { assignedBrokerRoles, teamMemberRoles } from "@/lib/permissions/team-assignment";
import { displayName, type UserRow } from "./user-types";

type Props = {
  users: UserRow[];
  managerRoles: string[];
  selected: string[];
  onChange: (ids: string[]) => void;
  managerId?: string;
  /** "brokers" picks the brokers under a Master Broker; the default picks agents and sales executives. */
  kind?: "executives" | "brokers";
  /** A new user has no one to remove yet, so the removal note is left out. */
  creating?: boolean;
};

type Group = {
  key: string;
  title: string;
  noun: string;
  hint: string;
  matches: (slug: string) => boolean;
};

const memberGroups: Group[] = [
  {
    key: "agents",
    title: "Agents",
    noun: "agents",
    hint: "Agents who report to this person.",
    matches: (slug) => slug === "agent",
  },
  {
    key: "executives",
    title: "Sales executives",
    noun: "sales executives",
    hint: "Sales executives who report to this person.",
    matches: (slug) => slug.startsWith("sales-executive"),
  },
];

const brokerGroup: Group = {
  key: "brokers",
  title: "Brokers",
  noun: "brokers",
  hint: "Brokers who report to this master broker.",
  matches: () => true,
};

/**
 * The people who report to a team lead. A broker's team is picked in two lists, Agents and
 * Sales executives; a Master Broker's in one list of Brokers. Each list edits its part of `selected`.
 */
export function ExecutivePicker({
  users,
  managerRoles,
  selected,
  onChange,
  managerId,
  kind = "executives",
  creating = false,
}: Props) {
  const allowed =
    kind === "brokers" ? assignedBrokerRoles(managerRoles) : teamMemberRoles(managerRoles);
  const groups = kind === "brokers" ? [brokerGroup] : memberGroups;
  const inGroup = (user: UserRow | undefined, group: Group) =>
    Boolean(user?.roles.some((role) => allowed.includes(role.slug) && group.matches(role.slug)));
  const visible = groups.filter(
    (group) =>
      allowed.some(group.matches) ||
      selected.some((id) =>
        inGroup(
          users.find((user) => user.id === id),
          group,
        ),
      ),
  );
  if (!visible.length) return null;

  return (
    <div className="grid min-w-0 gap-5 sm:col-span-2">
      {visible.map((group) => {
        // A broker list owns every selected id; member lists split them by role.
        const mine =
          kind === "brokers"
            ? selected
            : selected.filter((id) =>
                inGroup(
                  users.find((user) => user.id === id),
                  group,
                ),
              );
        const others = selected.filter((id) => !mine.includes(id));
        return (
          <TeamGroupPicker
            key={group.key}
            group={group}
            users={users.filter(
              (user) =>
                user.id !== managerId &&
                (mine.includes(user.id) || (user.status === "active" && inGroup(user, group))),
            )}
            allUsers={users}
            allowed={allowed}
            selected={mine}
            onChange={(ids) => onChange([...others, ...ids])}
          />
        );
      })}
      {kind !== "brokers" && !creating && (
        <p className="-mt-2 text-xs text-muted-foreground">Removed people lose their manager.</p>
      )}
    </div>
  );
}

function TeamGroupPicker({
  group,
  users,
  allUsers,
  allowed,
  selected,
  onChange,
}: {
  group: Group;
  /** The candidates for this list. */
  users: UserRow[];
  allUsers: UserRow[];
  allowed: string[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const matches = users.filter((user) =>
    `${displayName(user)} ${user.email}`.toLowerCase().includes(search.toLowerCase().trim()),
  );
  const remove = (id: string) => onChange(selected.filter((value) => value !== id));
  const roleOf = (user: UserRow) =>
    user.roles
      .filter((role) => allowed.includes(role.slug))
      .map((role) => role.name)
      .join(", ");

  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="text-sm font-medium">
        {group.title} <span className="font-normal text-muted-foreground">(optional)</span>
      </legend>
      <p className="text-xs text-muted-foreground">{group.hint}</p>
      {selected.length > 0 && (
        <ul aria-label={`Selected ${group.noun}`} className="mt-1 flex flex-wrap gap-2">
          {selected.map((id) => {
            const user = allUsers.find((item) => item.id === id);
            const name = user ? displayName(user) : "Unavailable user";
            return (
              <li
                key={id}
                className="flex max-w-full items-center gap-2 rounded-md border bg-muted/40 py-1 pl-3 pr-1"
              >
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium">{name}</span>
                  {user && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {roleOf(user) || user.email}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${name}${user ? ` (${user.email})` : ""}`}
                  onClick={() => remove(id)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <details className="relative mt-1">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-md border bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          {selected.length
            ? `Add or change ${group.noun} (${selected.length} selected)`
            : `Select ${group.noun}`}
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-2 text-popover-foreground shadow-md">
          <input
            aria-label={`Search ${group.noun}`}
            placeholder="Search name or email"
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />
          <div className="max-h-48 overflow-y-auto">
            {matches.map((user) => {
              const manager = allUsers.find((item) => item.id === user.brokerId);
              return (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-start gap-2 rounded px-2 py-2 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(user.id)}
                    onChange={(event) =>
                      event.target.checked ? onChange([...selected, user.id]) : remove(user.id)
                    }
                  />
                  <span className="min-w-0 break-words">
                    <span className="block font-medium">{displayName(user)}</span>
                    <span className="block text-xs text-muted-foreground">{user.email}</span>
                    {user.brokerId && (
                      <span className="block text-xs text-muted-foreground">
                        Current manager: {manager ? displayName(manager) : "Assigned"}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
            {!matches.length && (
              <p className="p-2 text-sm text-muted-foreground">
                {users.length ? "No matches." : `No active ${group.noun} yet.`}
              </p>
            )}
          </div>
        </div>
      </details>
    </fieldset>
  );
}
