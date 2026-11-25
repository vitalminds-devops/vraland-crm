"use client";

import { cn } from "@/lib/utils/cn";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import { ContactRow } from "./contact-row";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  ColumnsToggleButton,
  SortChevron,
  sortHeaderClass,
  tableHeadClass,
} from "@/components/ui/table-parts";

type Contact = {
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
};

type SortKey = "contact" | "stage" | "createdAt";

type ContactsTableProps = {
  contacts: Contact[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  sort?: string;
  dir?: string;
  showAdditionalColumns?: boolean;
  isLoading?: boolean;
  hasActiveFilters?: boolean;
  canArchive: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canViewDocuments?: boolean;
  canReassign?: boolean;
  onReassignBroker?: (contactId: string) => void;
};

export function ContactsTable({
  contacts,
  page,
  pages,
  pageSize,
  sort,
  dir,
  showAdditionalColumns = false,
  isLoading = false,
  hasActiveFilters = false,
  canArchive = false,
  canCreate = false,
  canEdit = false,
  canViewDocuments = false,
  canReassign = false,
  onReassignBroker,
}: ContactsTableProps) {
  const router = useRouter();
  const activeSort = (sort as SortKey | undefined) ?? null;
  const activeDir: "asc" | "desc" = dir === "asc" ? "asc" : "desc";

  const push = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    router.push(`/contacts?${params.toString()}`, { scroll: false });
  };

  const handleSort = (column: SortKey) => {
    push((params) => {
      params.set("page", "1");
      if (activeSort === column) {
        if (activeDir === "asc") {
          params.set("dir", "desc");
        } else {
          params.delete("sort");
          params.delete("dir");
        }
      } else {
        params.set("sort", column);
        params.set("dir", "asc");
      }
    });
  };

  const toggleColumns = () => {
    push((params) => {
      if (showAdditionalColumns) params.delete("cols");
      else params.set("cols", "1");
    });
  };

  const gotoPage = (next: number) =>
    push((params) => {
      params.set("page", String(Math.min(Math.max(1, next), pages)));
    });

  const changePageSize = (size: number) =>
    push((params) => {
      params.set("pageSize", String(size));
      params.set("page", "1");
    });

  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <Table className="w-full text-left text-sm">
          <TableHeader className="bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <TableRow>
              <TableHead className="sticky left-0 bg-muted/50 px-4 py-3">Contact</TableHead>
              <TableHead className="hidden px-4 py-3 md:table-cell">Assigned agent</TableHead>
              <TableHead className="hidden px-4 py-3 lg:table-cell">Broker</TableHead>
              <TableHead className="hidden px-4 py-3 sm:table-cell">Pipeline stage</TableHead>
              <TableHead className="hidden px-4 py-3 md:table-cell">Created</TableHead>
              <TableHead className="w-16 px-4 py-3 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/40">
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i} className="h-16">
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
                    <div className="space-y-1.5">
                      <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                      <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden px-4 py-3 md:table-cell">
                  <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                </TableCell>
                <TableCell className="hidden px-4 py-3 lg:table-cell">
                  <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                </TableCell>
                <TableCell className="hidden px-4 py-3 sm:table-cell">
                  <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                </TableCell>
                <TableCell className="hidden px-4 py-3 md:table-cell">
                  <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                </TableCell>
                <TableCell className="w-16 px-4 py-3">
                  <div className="ml-auto h-7 w-16 rounded-lg bg-muted animate-pulse" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="py-16">
        <EmptyState
          icon={User}
          title={hasActiveFilters ? "No matches" : "No contacts yet"}
          action={
            hasActiveFilters ? (
              <ButtonLink href="/contacts" variant="secondary">
                Clear filters
              </ButtonLink>
            ) : canCreate ? (
              <ButtonLink href="/contacts/new" variant="primary">
                Add contact
              </ButtonLink>
            ) : undefined
          }
        />
      </div>
    );
  }

  const sortAria = (column: SortKey): "ascending" | "descending" | "none" =>
    activeSort === column ? (activeDir === "asc" ? "ascending" : "descending") : "none";

  return (
    <>
      <div className="overflow-x-auto">
        <Table className="w-full text-left text-sm">
          <TableHeader className={cn(tableHeadClass, "max-sm:hidden")}>
            <TableRow>
              <TableHead
                scope="col"
                className="sticky left-0 z-10 bg-muted/50 px-4 py-3 max-md:bg-transparent"
                aria-sort={sortAria("contact")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("contact")}
                  className={sortHeaderClass}
                >
                  Contact
                  <SortChevron active={activeSort === "contact"} dir={activeDir} />
                </button>
              </TableHead>
              <TableHead scope="col" className="hidden px-4 py-3 md:table-cell">
                Assigned agent
              </TableHead>
              <TableHead scope="col" className="hidden px-4 py-3 lg:table-cell">
                Broker
              </TableHead>
              <TableHead
                scope="col"
                className="hidden px-4 py-3 sm:table-cell"
                aria-sort={sortAria("stage")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("stage")}
                  className={sortHeaderClass}
                >
                  Pipeline stage
                  <SortChevron active={activeSort === "stage"} dir={activeDir} />
                </button>
              </TableHead>
              <TableHead
                scope="col"
                className="hidden px-4 py-3 md:table-cell"
                aria-sort={sortAria("createdAt")}
              >
                <button
                  type="button"
                  onClick={() => handleSort("createdAt")}
                  className={sortHeaderClass}
                >
                  Created
                  <SortChevron active={activeSort === "createdAt"} dir={activeDir} />
                </button>
              </TableHead>
              {showAdditionalColumns && (
                <>
                  <TableHead scope="col" className="hidden px-4 py-3 xl:table-cell">
                    Employment Type
                  </TableHead>
                </>
              )}
              <TableHead scope="col" className="w-16 px-4 py-3 text-right">
                {/* The extra columns only show from xl, so the toggle does nothing below it. */}
                <span className="hidden xl:inline-flex">
                  <ColumnsToggleButton pressed={showAdditionalColumns} onToggle={toggleColumns} />
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/40">
            {contacts.map((contact) => (
              <TableRow
                key={contact.id}
                className="group h-16 border-b border-border/40 bg-card hover:bg-muted/40 transition-colors"
              >
                <ContactRow
                  contact={contact}
                  showAdditionalColumns={showAdditionalColumns}
                  canEdit={canEdit}
                  canViewDocuments={canViewDocuments}
                  canArchive={canArchive}
                  canReassign={canReassign}
                  onReassignBroker={onReassignBroker}
                />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        page={page}
        pages={pages}
        pageSize={pageSize}
        onPageChange={gotoPage}
        onPageSizeChange={changePageSize}
      />
    </>
  );
}
