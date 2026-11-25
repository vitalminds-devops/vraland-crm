"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, Download, Plus, Upload } from "lucide-react";
import { ButtonLink, buttonVariants } from "@/components/ui/button";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { cn } from "@/lib/utils/cn";
import { ImportForm } from "./import-form";

/**
 * Desktop shows every action as a button. Phones follow the usual app layout: a round Add
 * button in the corner, with a smaller round More button (Archived, Import, Export) above it.
 */
export function ContactPageActions({
  canArchive,
  canImport,
  canExport,
  canCreate,
}: {
  canArchive: boolean;
  canImport: boolean;
  canExport: boolean;
  canCreate: boolean;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const more = [
    ...(canArchive
      ? [{ label: "Archived", icon: <Archive />, href: "/contacts/archive", asChild: true }]
      : []),
    ...(canImport
      ? [{ label: "Import CSV", icon: <Upload />, onSelect: () => setImportOpen(true) }]
      : []),
    ...(canExport
      ? [{ label: "Export", icon: <Download />, href: "/api/contacts/export", asChild: true }]
      : []),
  ];

  return (
    // On phones everything here is hidden or floating, so the header row can drop away.
    <div
      data-phone-hidden=""
      className="flex flex-wrap items-center justify-end gap-2 max-sm:contents"
    >
      {canArchive && (
        <ButtonLink href="/contacts/archive" variant="secondary" className="max-sm:hidden">
          Archived
        </ButtonLink>
      )}
      {canImport && (
        <ImportForm
          open={importOpen}
          onOpenChange={setImportOpen}
          triggerClassName="max-sm:hidden"
        />
      )}
      {canExport && (
        <a
          href="/api/contacts/export"
          className={buttonVariants({ variant: "secondary", className: "max-sm:hidden" })}
        >
          <Download className="mr-2 h-4 w-4" />
          Export
        </a>
      )}
      {canCreate && (
        <>
          <ButtonLink href="/contacts/new" variant="primary" className="max-sm:hidden">
            <Plus className="mr-2 h-4 w-4" />
            Add contact
          </ButtonLink>
          <Link
            href="/contacts/new"
            aria-label="Add contact"
            className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_16px_-4px_rgb(0_0_0/0.35)] transition-transform active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none sm:hidden"
          >
            <Plus aria-hidden="true" className="size-6" />
          </Link>
        </>
      )}
      {more.length > 0 && (
        // A smaller round button stacked above Add, centred on it.
        <RowActionsMenu
          ariaLabel="More actions"
          sections={[{ label: "", items: more }]}
          className={cn(
            "fixed right-[22px] z-40 size-11 rounded-full border border-border bg-card text-foreground shadow-[0_4px_12px_-4px_rgb(0_0_0/0.3)] sm:hidden",
            canCreate
              ? "bottom-[calc(8.75rem+env(safe-area-inset-bottom))]"
              : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]",
          )}
        />
      )}
    </div>
  );
}
