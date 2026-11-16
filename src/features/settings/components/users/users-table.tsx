"use client";

import {
  Eye,
  Files,
  Fingerprint,
  Mail,
  Network,
  Pencil,
  Phone,
  Search,
  Archive,
  UserCheck,
  UserX,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { avatarSrc } from "@/features/account/lib/avatar";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  ColumnsToggleButton,
  SortChevron,
  sortHeaderClass,
  tableHeadClass,
} from "@/components/ui/table-parts";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RowActionsMenu, type MenuSection } from "@/components/ui/row-actions-menu";
import { cn } from "@/lib/utils/cn";

import { DataAccessCell } from "./data-access-cell";
import { RoleChips } from "./role-chips";
import { StatusBadge } from "./status-badge";
import { displayName, initialsOf, type UserRow } from "./user-types";
import { formatDate } from "@/features/contacts";

export type SortKey = "name" | "status";
export type SortDir = "asc" | "desc";

export type UsersTableProps = {
  users: UserRow[];
  /** The signed-in user's own id, so their row can be made read-only. */
  currentUserId: string;
  isLoading?: boolean;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onCreateUser?: () => void;
  onEdit: (user: UserRow) => void;
  onViewProfile: (user: UserRow) => void;
  onDeactivate: (user: UserRow) => void;
  onReactivate: (user: UserRow) => void;
  /** Set only when the viewer holds `users.delete`. */
  onDelete?: (user: UserRow) => void;
  onCopyEmail: (user: UserRow) => void;
  onCopyId: (user: UserRow) => void;
  onCopyPhone: (user: UserRow) => void;
  selectedIds: Set<string>;
  onToggleSelect: (userId: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  isBusy?: boolean;
  /** Shows the row checkboxes (toggled by the "Select users" button). */
  showSelection: boolean;
  showAdditionalColumns: boolean;
  onToggleColumns: () => void;
  page: number;
  pages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

const ROW_HEIGHT = "h-16"; // matches the Contacts table row height

function buildUserMenuSections({
  user,
  currentUserId,
  onEdit,
  onViewProfile,
  onCopyEmail,
  onCopyId,
  onCopyPhone,
  onDeactivate,
  onReactivate,
  onDelete,
  isBusy,
}: {
  user: UserRow;
  currentUserId: string;
  onEdit: (user: UserRow) => void;
  onViewProfile: (user: UserRow) => void;
  onCopyEmail: (user: UserRow) => void;
  onCopyId: (user: UserRow) => void;
  onCopyPhone: (user: UserRow) => void;
  onDeactivate: (user: UserRow) => void;
  onReactivate: (user: UserRow) => void;
  onDelete?: (user: UserRow) => void;
  isBusy?: boolean;
}): MenuSection[] {
  const isActive = user.status === "active";
  const isSelf = user.id === currentUserId;

  const sections: MenuSection[] = [
    {
      label: "View",
      items: [
        {
          label: "View profile",
          icon: <Eye />,
          onSelect: () => onViewProfile(user),
        },
        {
          label: "Documents",
          icon: <Files />,
          href: `/settings/users/${user.id}/documents`,
          asChild: true,
          badge: user.documents.length > 0 ? user.documents.length : undefined,
        },
        {
          label: "Find in organization chart",
          icon: <Network />,
          href: "/settings/users/organization-chart",
          asChild: true,
        },
      ],
    },
    {
      label: "Contact",
      items: [
        {
          label: "Email user",
          icon: <Mail />,
          href: `mailto:${user.email}`,
          asChild: true,
        },
        {
          label: "Copy email",
          icon: <Mail />,
          onSelect: () => onCopyEmail(user),
        },
        ...(user.phone
          ? [
              {
                label: "Call",
                icon: <Phone />,
                href: `tel:${user.phone.replaceAll(/[^+\d]/g, "")}`,
                asChild: true,
              },
              {
                label: "Copy phone",
                icon: <Phone />,
                onSelect: () => onCopyPhone(user),
              },
            ]
          : []),
        {
          label: "Copy user ID",
          icon: <Fingerprint />,
          onSelect: () => onCopyId(user),
        },
      ],
    },
  ];

  if (!isSelf)
    sections.push({
      label: "",
      items: [
        {
          label: "Edit",
          icon: <Pencil />,
          onSelect: () => onEdit(user),
        },
        {
          label: isActive ? "Deactivate" : "Reactivate",
          icon: isActive ? <UserX /> : <UserCheck />,
          onSelect: () => (isActive ? onDeactivate(user) : onReactivate(user)),
          disabled: isBusy,
          destructive: isActive,
        },
        ...(onDelete
          ? [
              {
                label: "Archive user",
                icon: <Archive />,
                onSelect: () => onDelete(user),
                disabled: isBusy,
                destructive: true,
              },
            ]
          : []),
      ],
    });

  return sections;
}

function TableSkeleton() {
  return (
    <div>
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center gap-4 border-b border-border/40 px-4 last:border-b-0",
            ROW_HEIGHT,
          )}
        >
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="hidden h-5 w-16 rounded-full md:block" />
          <Skeleton className="hidden h-3.5 w-20 lg:block" />
          <Skeleton className="hidden h-3.5 w-24 xl:block" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyTable({
  hasActiveFilters,
  onClearFilters,
  onCreateUser,
}: {
  hasActiveFilters: boolean;
  onClearFilters?: () => void;
  onCreateUser?: () => void;
}) {
  return (
    <div className="py-16">
      <EmptyState
        icon={hasActiveFilters ? Search : UserX}
        title={hasActiveFilters ? "No matches" : "No users yet"}
        action={
          hasActiveFilters ? (
            <Button type="button" variant="secondary" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={onCreateUser}>
              Create user
            </Button>
          )
        }
      />
    </div>
  );
}

export function UsersTable({
  users,
  currentUserId,
  isLoading = false,
  hasActiveFilters = false,
  onClearFilters,
  onCreateUser,
  onEdit,
  onViewProfile,
  onDeactivate,
  onReactivate,
  onDelete,
  onCopyEmail,
  onCopyId,
  onCopyPhone,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  sortKey,
  sortDir,
  onSort,
  isBusy = false,
  showSelection,
  showAdditionalColumns,
  onToggleColumns,
  page,
  pages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: UsersTableProps) {
  const allSelected = users.length > 0 && users.every((user) => selectedIds.has(user.id));
  const someSelected = users.some((user) => selectedIds.has(user.id));

  if (isLoading) {
    return <TableSkeleton />;
  }

  if (users.length === 0) {
    return (
      <EmptyTable
        hasActiveFilters={hasActiveFilters}
        onClearFilters={onClearFilters}
        onCreateUser={onCreateUser}
      />
    );
  }

  const sortAria = (key: SortKey): "ascending" | "descending" | "none" =>
    sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  const headerCell = (key: SortKey, label: string, extraClass?: string) => (
    <TableHead scope="col" className={cn("px-4 py-3", extraClass)} aria-sort={sortAria(key)}>
      <button type="button" onClick={() => onSort(key)} className={sortHeaderClass}>
        {label}
        <SortChevron active={sortKey === key} dir={sortDir} />
      </button>
    </TableHead>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto">
        <Table className="w-full text-left text-sm">
          <TableHeader className={tableHeadClass}>
            <TableRow>
              {showSelection && (
                <TableHead scope="col" className="w-10 px-2 py-3">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(value) => onToggleSelectAll(value === true)}
                    aria-label="Select all users"
                  />
                </TableHead>
              )}
              {headerCell("name", "User", "min-w-[240px]")}
              <TableHead scope="col" className="px-4 py-3">
                Roles
              </TableHead>
              <TableHead scope="col" className="hidden px-4 py-3 lg:table-cell">
                Data access
              </TableHead>
              {showAdditionalColumns && (
                <>
                  <TableHead scope="col" className="hidden px-4 py-3 xl:table-cell">
                    Phone
                  </TableHead>
                  <TableHead scope="col" className="hidden px-4 py-3 xl:table-cell">
                    Last login
                  </TableHead>
                </>
              )}
              {headerCell("status", "Status")}
              <TableHead scope="col" className="w-28 px-4 py-3 text-right">
                <ColumnsToggleButton pressed={showAdditionalColumns} onToggle={onToggleColumns} />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/40">
            {users.map((user) => {
              const selected = selectedIds.has(user.id);
              const isSelf = user.id === currentUserId;
              const openRow = () => (isSelf ? onViewProfile(user) : onEdit(user));
              return (
                <TableRow
                  key={user.id}
                  id={`user-${user.id}`}
                  tabIndex={0}
                  onClick={openRow}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      openRow();
                    }
                  }}
                  className={cn(
                    "group cursor-pointer border-b border-border/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30",
                    ROW_HEIGHT,
                    selected ? "bg-primary/5" : "bg-card hover:bg-muted/40",
                  )}
                >
                  {showSelection && (
                    <TableCell
                      className="w-10 px-2 py-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(value) => onToggleSelect(user.id, value === true)}
                        aria-label={`Select ${displayName(user)}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <InitialsAvatar
                        initials={initialsOf(user)}
                        src={avatarSrc(user.id, user.avatarUrl)}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{displayName(user)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email || "No email"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <RoleChips roles={user.roles} />
                  </TableCell>
                  <TableCell className="hidden px-4 py-3 lg:table-cell">
                    <DataAccessCell scope={user.dataScope} />
                  </TableCell>
                  {showAdditionalColumns && (
                    <>
                      <TableCell className="hidden px-4 py-3 text-sm text-foreground xl:table-cell">
                        {user.phone || <span className="text-muted-foreground">No phone</span>}
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 text-sm text-muted-foreground xl:table-cell">
                        {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="px-4 py-3">
                    <StatusBadge value={user.status} />
                  </TableCell>
                  <TableCell
                    className="px-4 py-3 text-right"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <RowActionsMenu
                      ariaLabel={`Actions for ${displayName(user)}`}
                      sections={buildUserMenuSections({
                        user,
                        currentUserId,
                        onEdit,
                        onViewProfile,
                        onCopyEmail,
                        onCopyId,
                        onCopyPhone,
                        onDeactivate,
                        onReactivate,
                        onDelete,
                        isBusy,
                      })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        page={page}
        pages={pages}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </TooltipProvider>
  );
}
