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
import { CalendarClock, Files, Mail, Network, Pencil, Phone, ShieldCheck, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import {
  dataScopeLabels,
  dataScopePermissions,
  permissionMetadata,
} from "@/lib/permissions/catalog";
import { roleDescriptionFor } from "./role-chips";
import { StatusBadge } from "./status-badge";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { avatarSrc } from "@/features/account/lib/avatar";

import { displayName, initialsOf, type UserRow } from "./user-types";

const detailLabel = "text-xs font-medium text-muted-foreground";

function formatDateTime(value: Date | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatBytes(bytes: number | null): string | null {
  if (bytes === null || bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5 py-3">
      <dt className={detailLabel}>{label}</dt>
      <dd className="text-sm leading-5 break-words text-foreground">{children}</dd>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Mail;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 sm:justify-start"
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 text-left">{label}</span>
    </Link>
  );
}

export type UserProfileDialogProps = {
  user: UserRow;
  open: boolean;
  onClose: () => void;
  /** Name of the assigned Broker, resolved from the broker list. */
  brokerName: string | null;
  onEdit: (user: UserRow) => void;
};

export function UserProfileDialog({
  user,
  open,
  onClose,
  brokerName,
  onEdit,
}: UserProfileDialogProps) {
  const scopeLabel = dataScopeLabels[user.dataScope];
  const scopeDescription = permissionMetadata[dataScopePermissions[user.dataScope]].description;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 backdrop-blur-sm sm:p-4">
          <DialogPopup className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-card shadow-xl sm:max-h-[calc(100dvh-2rem)]">
            <header className="flex shrink-0 items-start gap-3 border-b border-border/50 p-4 sm:p-5">
              <InitialsAvatar
                initials={initialsOf(user)}
                src={avatarSrc(user.id, user.avatarUrl)}
                className="h-12 w-12 text-sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <DialogTitle className="min-w-0 text-lg leading-6 break-words font-semibold tracking-tight">
                    {displayName(user)}
                  </DialogTitle>
                  <StatusBadge value={user.status} />
                </div>
                <DialogDescription className="mt-1 text-sm leading-5 [overflow-wrap:anywhere] text-muted-foreground">
                  {user.email}
                </DialogDescription>
              </div>
              <DialogClose
                aria-label="Close profile"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <X aria-hidden="true" size={16} />
              </DialogClose>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <QuickAction href={`mailto:${user.email}`} icon={Mail} label="Email" />
                {user.phone && (
                  <QuickAction
                    href={`tel:${user.phone.replaceAll(/[^+\d]/g, "")}`}
                    icon={Phone}
                    label="Call"
                  />
                )}
                <QuickAction
                  href={`/settings/users/${user.id}/documents`}
                  icon={Files}
                  label={`Documents${user.documents.length ? ` (${user.documents.length})` : ""}`}
                />
                <QuickAction
                  href="/settings/users/organization-chart"
                  icon={Network}
                  label="Organization chart"
                />
              </div>

              <dl className="mt-3 grid gap-x-6 sm:grid-cols-2 [&>div]:border-b [&>div]:border-border/40">
                <DetailRow label="Email">{user.email}</DetailRow>
                <DetailRow label="Phone">
                  {user.phone ?? <span className="text-muted-foreground">Not set</span>}
                </DetailRow>
                <DetailRow label="Broker">
                  {brokerName ?? <span className="text-muted-foreground">No broker</span>}
                </DetailRow>
                <DetailRow label="Last sign-in">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {formatDateTime(user.lastLoginAt)}
                  </span>
                </DetailRow>
              </dl>
              <dl className="divide-y divide-border/40">
                <DetailRow label="Data access">
                  <span className="block font-medium">{scopeLabel}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {scopeDescription}
                  </span>
                </DetailRow>
                <DetailRow label="Roles">
                  {user.roles.length ? (
                    <ul className="grid gap-1.5">
                      {user.roles.map((role) => (
                        <li key={role.id} className="flex items-start gap-2">
                          <ShieldCheck
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                          <span>
                            <span className="font-medium">{role.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {roleDescriptionFor(role.name)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">No role assigned</span>
                  )}
                </DetailRow>
                <DetailRow label="Documents">
                  {user.documents.length ? (
                    <ul className="grid gap-1">
                      {user.documents.map((document) => {
                        const size = formatBytes(document.fileSizeBytes);
                        return (
                          <li
                            key={document.id}
                            className="flex items-start justify-between gap-3 py-1.5"
                          >
                            <span className="min-w-0 break-words">
                              {document.name}
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {document.documentType}
                              </span>
                            </span>
                            {size && (
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {size}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">No documents uploaded</span>
                  )}
                </DetailRow>
                <DetailRow label="User ID">
                  <code className="text-xs break-all text-muted-foreground">{user.id}</code>
                </DetailRow>
              </dl>
            </div>

            <footer className="flex shrink-0 justify-end border-t border-border/50 px-4 py-3 sm:px-5">
              <div className="flex w-full items-center gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="gap-2"
                  onClick={() => onEdit(user)}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit user
                </Button>
              </div>
            </footer>
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
