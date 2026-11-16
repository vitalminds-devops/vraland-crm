"use client";

import { Button } from "@/components/ui/button";
import { Toolbar } from "@/components/ui/toolbar";
import { Select, ToolbarSearch } from "@/components/ui/toolbar-helpers";

import { userStatusLabels } from "./status-badge";

export type RoleFilterOption = { id: string; name: string; count: number };

export type UsersToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  /** How many users hold each status, keyed by status. */
  statusCounts: Map<string, number>;
  roleId: string;
  onRoleChange: (value: string) => void;
  roleOptions: RoleFilterOption[];
  totalCount: number;
  noRoleCount: number;
  visibleCount: number;
  onClearFilters: () => void;
  isDirty: boolean;
};

export function UsersToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  statusCounts,
  roleId,
  onRoleChange,
  roleOptions,
  totalCount,
  noRoleCount,
  visibleCount,
  onClearFilters,
  isDirty,
}: UsersToolbarProps) {
  const hasActiveFilters = roleId !== "all" || status !== "all" || Boolean(search);

  return (
    <Toolbar>
      <ToolbarSearch
        name="search"
        value={search}
        onValueChange={onSearchChange}
        aria-label="Search users"
        placeholder="Search name or email"
      />
      <Select
        name="role"
        aria-label="Filter by role"
        value={roleId}
        onChange={(event) => onRoleChange(event.target.value)}
      >
        <option value="all">All roles</option>
        {roleOptions.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name} ({role.count})
          </option>
        ))}
        {noRoleCount > 0 && <option value="none">No role ({noRoleCount})</option>}
      </Select>
      <Select
        name="status"
        aria-label="Filter by status"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
      >
        <option value="all">All statuses</option>
        {(["active", "invited", "inactive", "suspended"] as const).map((value) => (
          <option key={value} value={value}>
            {userStatusLabels[value]} ({statusCounts.get(value) ?? 0})
          </option>
        ))}
      </Select>
      {hasActiveFilters && (
        <Button type="button" variant="ghost" onClick={onClearFilters}>
          Clear
        </Button>
      )}
      <span className="sr-only" aria-live="polite">
        Showing {visibleCount} of {totalCount} users
        {isDirty ? " · unsaved changes" : ""}
      </span>
    </Toolbar>
  );
}
