"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Edit3, History, KeyRound, LayoutGrid, Trash2 } from "lucide-react";
import { useRemoveSeveral } from "../lib/remove-several";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArchivePropertyButton } from "./property-archive-buttons";

export function PropertyActionsMenu({
  propertyId,
  title,
  canEdit,
  canDesign,
  canAccess,
  canArchive,
  history,
}: {
  propertyId: string;
  title: string;
  canEdit: boolean;
  /** Unit types, floors and parking are designed on the property's Design page. */
  canDesign: boolean;
  canAccess: boolean;
  canArchive: boolean;
  history: ReactNode;
}) {
  const openRemoveSeveral = useRemoveSeveral((state) => state.setOpen);
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" className="gap-2">
            Actions <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {canEdit && (
            <DropdownMenuItem asChild className="min-h-10">
              <Link href={`/properties/${propertyId}/edit`}>
                <Edit3 aria-hidden="true" />
                Edit
              </Link>
            </DropdownMenuItem>
          )}
          {/* Two ways into the Design page: straight to unit types, or to the floors. */}
          {canDesign && (
            <>
              {/* One door into Design: unit and parking types, floors and sections are its tabs. */}
              <DropdownMenuItem asChild className="min-h-10">
                <Link href={`/design/${propertyId}`}>
                  <LayoutGrid aria-hidden="true" />
                  Design property
                </Link>
              </DropdownMenuItem>
            </>
          )}
          {canAccess && (
            <DropdownMenuItem asChild className="min-h-10">
              <Link href={`/properties/${propertyId}/access`}>
                <KeyRound aria-hidden="true" />
                Access
              </Link>
            </DropdownMenuItem>
          )}
          {canDesign && (
            <DropdownMenuItem onSelect={() => openRemoveSeveral(true)} className="min-h-10">
              <Trash2 aria-hidden="true" />
              Remove several
            </DropdownMenuItem>
          )}
          {history && (
            <DropdownMenuItem onSelect={() => setHistoryOpen(true)} className="min-h-10">
              <History aria-hidden="true" />
              History
            </DropdownMenuItem>
          )}
          {canArchive && (
            <>
              <DropdownMenuSeparator />
              <ArchivePropertyButton propertyId={propertyId} title={title} menuItem />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {history}
    </Dialog>
  );
}
