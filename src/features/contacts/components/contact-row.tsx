"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, Archive, FileText, Pencil, Users, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { RowActionsMenu, type MenuSection } from "@/components/ui/row-actions-menu";
import { notify } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { PipelineStageBadge } from "./pipeline-stage-badge";
import { formatDate, getRelativeTime, getInitials, formatContactName } from "../lib/helpers";
import { getUserFacingMessage } from "@/lib/error-handler";

export type Contact = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  mobilePhone1: string | null;
  mobilePhone2: string | null;
  mobilePhone3: string | null;
  preferredContactMethods: readonly string[];
  employmentType: string | null;
  lifecycleStage: string | null;
  pipelineStage: string | null;
  stageProbability: number | null;
  assignedFirstName: string | null;
  assignedLastName: string | null;
  brokerUserId?: string | null;
  brokerFirstName: string | null;
  brokerLastName: string | null;
  approvalStatus: string;
  createdAt: Date | string;
  contactCode?: string;
};

type ContactRowProps = {
  contact: Contact;
  showAdditionalColumns?: boolean;
  canEdit?: boolean;
  canViewDocuments?: boolean;
  canArchive?: boolean;
  canReassign?: boolean;
  onReassignBroker?: (contactId: string) => void;
};

export function ContactRow({
  contact,
  showAdditionalColumns = false,
  canEdit = false,
  canViewDocuments = false,
  canArchive = false,
  canReassign = false,
  onReassignBroker,
}: ContactRowProps) {
  const router = useRouter();
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const initials = getInitials(contact.firstName, contact.lastName);
  const displayName = formatContactName(contact);
  const createdDate =
    typeof contact.createdAt === "string" ? new Date(contact.createdAt) : contact.createdAt;
  // Captured once per mount so render stays pure.
  const [now] = useState(Date.now);
  const isNew =
    !isNaN(createdDate.getTime()) && now - createdDate.getTime() < 7 * 24 * 60 * 60 * 1000;
  const assignedAgent = [contact.assignedFirstName, contact.assignedLastName]
    .filter(Boolean)
    .join(" ");
  const broker = [contact.brokerFirstName, contact.brokerLastName].filter(Boolean).join(" ");

  const handleArchive = async () => {
    setShowArchiveConfirm(true);
  };

  const confirmArchive = async () => {
    setIsArchiving(true);
    try {
      const { archiveContact } = await import("../actions/contact.actions");
      const result = await archiveContact(contact.id);
      if (result.success) {
        notify("Contact archived.", "success");
        setShowArchiveConfirm(false);
        router.refresh();
      } else {
        notify(result.error.message || "Couldn't archive contact.", "error");
      }
    } catch (error) {
      notify(getUserFacingMessage(error), "error");
    } finally {
      setIsArchiving(false);
    }
  };

  const buildContactMenuSections = (): MenuSection[] => {
    const sections: MenuSection[] = [
      {
        label: "View",
        items: [
          {
            label: "View contact",
            icon: <Eye />,
            href: `/contacts/${contact.id}`,
            asChild: true,
          },
          ...(canViewDocuments
            ? [
                {
                  label: "Documents",
                  icon: <FileText />,
                  href: `/contacts/${contact.id}/documents`,
                  asChild: true,
                },
              ]
            : []),
        ],
      },
      {
        label: "",
        items: [
          ...(canEdit
            ? [
                {
                  label: "Edit contact",
                  icon: <Pencil />,
                  href: `/contacts/${contact.id}/edit`,
                  asChild: true,
                },
              ]
            : []),
          ...(canReassign
            ? [
                {
                  label: "Reassign broker",
                  icon: <Users />,
                  onSelect: () => onReassignBroker?.(contact.id),
                },
              ]
            : []),
          ...(canArchive
            ? [
                {
                  label: "Archive",
                  icon: <Archive />,
                  onSelect: () => handleArchive(),
                  destructive: true,
                },
              ]
            : []),
        ],
      },
    ];

    return sections;
  };

  return (
    <>
      {/* max-w-0 with w-full lets the one-line agent/broker text truncate instead of widening the table. */}
      <TableCell className="sticky left-0 px-4 py-3 bg-card group-hover:bg-muted/40 max-sm:w-full max-sm:max-w-0">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <InitialsAvatar initials={initials} />
            {isNew && (
              <span className="absolute -top-1.5 -right-1.5 rounded-full bg-green-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm">
                NEW
              </span>
            )}
          </div>
          <div className="min-w-0">
            <Link
              href={`/contacts/${contact.id}`}
              className="block font-medium break-words text-foreground transition-colors hover:text-primary hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {displayName}
            </Link>
            {/* The agent and broker columns are hidden on narrow screens, so they show here. */}
            <p className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
              Agent: {assignedAgent || "Unassigned"}
            </p>
            <p className="truncate text-xs text-muted-foreground lg:hidden">
              {broker ? `Broker: ${broker}` : "No broker"}
            </p>
            <div className="mt-1.5 sm:hidden" aria-label="Pipeline stage">
              <PipelineStageBadge
                stage={contact.pipelineStage}
                probability={contact.stageProbability}
              />
            </div>
          </div>
        </div>
      </TableCell>

      <TableCell className="hidden px-4 py-3 text-sm text-foreground md:table-cell">
        {assignedAgent || <span className="text-muted-foreground">Unassigned</span>}
      </TableCell>

      <TableCell className="hidden px-4 py-3 text-sm text-foreground lg:table-cell">
        {broker || <span className="text-muted-foreground">No broker</span>}
      </TableCell>

      <TableCell className="hidden px-4 py-3 sm:table-cell">
        <PipelineStageBadge stage={contact.pipelineStage} probability={contact.stageProbability} />
      </TableCell>

      <TableCell
        className="hidden px-4 py-3 text-sm text-muted-foreground md:table-cell"
        title={getRelativeTime(contact.createdAt)}
      >
        {formatDate(contact.createdAt)}
      </TableCell>

      {showAdditionalColumns && (
        <>
          <TableCell className="hidden px-4 py-3 xl:table-cell">
            {contact.employmentType ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {contact.employmentType}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground/70">Not specified</span>
            )}
          </TableCell>
        </>
      )}

      <TableCell className="w-16 px-4 py-3 text-right">
        <RowActionsMenu
          ariaLabel={`Actions for ${displayName}`}
          sections={buildContactMenuSections()}
        />
      </TableCell>

      {showArchiveConfirm && (
        <Dialog
          open={showArchiveConfirm}
          onOpenChange={(next) => {
            if (!next) setShowArchiveConfirm(false);
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
                      Archive this contact?
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-muted-foreground">
                      You can restore {displayName} from the archive.
                    </DialogDescription>
                  </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowArchiveConfirm(false)}
                    disabled={isArchiving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={confirmArchive}
                    disabled={isArchiving}
                  >
                    {isArchiving ? "Archiving…" : "Archive"}
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
