"use client";

import { ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { tableHeadClass } from "@/components/ui/table-parts";
import { notify } from "@/components/ui/toast";
import { formatDate, getInitials } from "@/features/contacts";

import { setUserDeleted } from "../../actions/settings.actions";

type DeletedUser = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  deletedAt: Date | null;
};

const nameOf = (user: DeletedUser) => `${user.firstName} ${user.lastName ?? ""}`.trim();

/** Soft-deleted accounts, each with a Restore button. */
export function DeletedUsersTable({ users }: { users: DeletedUser[] }) {
  const router = useRouter();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const restore = (user: DeletedUser) => {
    setRestoringId(user.id);
    startTransition(async () => {
      const result = await setUserDeleted({ id: user.id, deleted: false });
      setRestoringId(null);
      if (result.success) {
        notify(`${nameOf(user)} restored. Activate them to let them sign in.`, "success");
        router.refresh();
      } else {
        notify(result.error.message || "Couldn't restore the user.", "error");
      }
    });
  };

  return (
    <Card className="mt-6">
      <CardContent className="p-0">
        {users.length === 0 ? (
          <EmptyState icon={ArchiveRestore} title="No archived users" />
        ) : (
          <div className="overflow-x-auto">
            <Table className="w-full text-left text-sm">
              <TableHeader className={tableHeadClass}>
                <TableRow>
                  <TableHead scope="col" className="px-4 py-3">
                    User
                  </TableHead>
                  <TableHead scope="col" className="hidden px-4 py-3 sm:table-cell">
                    Archived
                  </TableHead>
                  <TableHead scope="col" className="w-32 px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/40">
                {users.map((user) => (
                  <TableRow key={user.id} className="h-16 bg-card">
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <InitialsAvatar
                          initials={getInitials(user.firstName, user.lastName ?? "")}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{nameOf(user)}</p>
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {user.deletedAt ? formatDate(user.deletedAt) : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="secondary"
                        className="gap-2"
                        disabled={pending}
                        onClick={() => restore(user)}
                      >
                        <ArchiveRestore aria-hidden="true" size={16} />
                        {restoringId === user.id ? "Restoring…" : "Restore"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
