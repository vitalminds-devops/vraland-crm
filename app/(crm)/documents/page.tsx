import Link from "next/link";
import { Download, Eye, Search } from "lucide-react";
import { FilterForm } from "@/components/common/filter-form";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { ButtonLink, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArchiveButton,
  DocumentUpload,
  RestoreButton,
} from "@/features/documents/components/document-forms";
import { listDocuments } from "@/features/documents/queries/document.queries";
import { formatContactName } from "@/features/contacts/lib/helpers";
import { documentTypeLabel } from "@/features/contacts/lib/contact-options";
import { requirePagePermission } from "@/lib/permissions/authorization";

/** A short, readable file kind instead of the raw MIME type. */
export const fileKind = (mimeType: string | null) =>
  mimeType === "application/pdf"
    ? "PDF"
    : mimeType?.startsWith("image/")
      ? "Image"
      : mimeType?.includes("word")
        ? "Word"
        : mimeType === "text/plain"
          ? "Text"
          : "File";

export const size = (v: number | null) =>
  v === null
    ? "—"
    : v < 1024
      ? `${v} B`
      : v < 1048576
        ? `${(v / 1024).toFixed(1)} KB`
        : `${(v / 1048576).toFixed(1)} MB`;

const input = "rounded-md border bg-background px-3 py-2 text-sm";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
  }>;
}) {
  await requirePagePermission("documents.view");
  const q = await searchParams;
  const page = Math.max(1, Number(q.page) || 1);
  const data = await listDocuments({
    page,
    search: q.search,
    shared: true,
  });
  const pageHref = (target: number) =>
    `/documents?${new URLSearchParams({
      ...(q.search ? { search: q.search } : {}),
      page: String(target),
    }).toString()}`;

  return (
    <PageContainer>
      <PageHeader
        title="Documents"
        description="Shared files, forms and templates. Download, save as PDF or print."
        actions={
          <>
            {data.canArchive && (
              <ButtonLink href="/documents/archive" variant="secondary">
                Archive
              </ButtonLink>
            )}
            {data.canManage && <DocumentUpload shared />}
          </>
        }
      />
      <div className="mt-6 overflow-hidden rounded-xl border border-border/70 bg-card">
        <FilterForm className="flex flex-wrap items-center gap-2 border-b border-border/60 p-4 sm:px-5">
          <label className="relative w-full min-w-0 sm:max-w-md">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              name="search"
              defaultValue={q.search}
              placeholder="Search shared files"
              aria-label="Search documents"
              className={`${input} pl-9`}
            />
          </label>
          {q.search && (
            <ButtonLink href="/documents" variant="ghost" className="shrink-0">
              Clear
            </ButtonLink>
          )}
        </FilterForm>
        <DocumentTable
          shared
          rows={data.rows}
          action={data.canArchive ? "archive" : undefined}
          empty={
            q.search
              ? "No shared files match your search."
              : "No shared files yet. An administrator can upload forms and templates here."
          }
        />
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3 text-xs sm:px-5">
          <span className="text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{data.total}</span>{" "}
            {data.total === 1 ? "document" : "documents"}
          </span>
          <div>
            {page > 1 && (
              <ButtonLink href={pageHref(page - 1)} variant="secondary">
                Previous
              </ButtonLink>
            )}{" "}
            {page < data.pages && (
              <ButtonLink href={pageHref(page + 1)} variant="secondary">
                Next
              </ButtonLink>
            )}
          </div>
        </footer>
      </div>
    </PageContainer>
  );
}

export function DocumentTable({
  rows,
  action,
  shared = false,
  empty = "No documents yet.",
}: {
  rows: Awaited<ReturnType<typeof listDocuments>>["rows"];
  empty?: string;
  shared?: boolean;
  /** The per-row button: archive on the main list, restore on the archive. */
  action?: "archive" | "restore";
}) {
  return rows.length ? (
    <div className="overflow-x-auto">
      <Table className="w-full text-left text-sm">
        <TableHeader className="bg-muted/30 [&_th]:text-xs">
          <TableRow>
            <TableHead className="px-4 py-3 sm:px-5">Document</TableHead>
            {!shared && <TableHead>Type</TableHead>}
            <TableHead className={shared ? "hidden md:table-cell" : undefined}>
              {shared ? "Uploaded by" : "Contact"}
            </TableHead>
            <TableHead className={shared ? "hidden md:table-cell" : undefined}>Created</TableHead>
            {shared && <TableHead className="px-4 text-right sm:px-5">Actions</TableHead>}
            {action && !shared && (
              <TableHead className="px-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((v) => (
            <TableRow key={v.id} className="border-t">
              <TableCell className="px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/documents/${v.id}`}
                      title={v.name}
                      className="line-clamp-2 font-medium underline-offset-4 outline-none [overflow-wrap:anywhere] hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {v.name}
                    </Link>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {fileKind(v.mimeType)} · {size(v.fileSizeBytes)}
                    </p>
                  </div>
                </div>
              </TableCell>
              {!shared && (
                <TableCell>
                  <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    {documentTypeLabel(v.documentType)}
                  </span>
                </TableCell>
              )}
              <TableCell className={shared ? "hidden md:table-cell" : undefined}>
                {shared ? (
                  [v.creatorFirstName, v.creatorLastName].filter(Boolean).join(" ") ||
                  "Administrator"
                ) : v.contactId && v.contactFirstName ? (
                  <Link href={`/contacts/${v.contactId}`} className="hover:underline">
                    {formatContactName({
                      firstName: v.contactFirstName,
                      middleName: v.contactMiddleName,
                      lastName: v.contactLastName,
                    })}
                  </Link>
                ) : (
                  v.dealTitle || v.propertyTitle || <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell
                className={`whitespace-nowrap text-muted-foreground ${shared ? "hidden md:table-cell" : ""}`}
              >
                {v.createdAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </TableCell>
              {shared && (
                <TableCell className="w-px px-4 py-4 sm:px-5">
                  <div className="flex flex-col items-end gap-2 whitespace-nowrap sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex items-center gap-2">
                      <ButtonLink
                        href={`/documents/${v.id}`}
                        variant="secondary"
                        size="sm"
                        aria-label={`Open ${v.name}`}
                        className="gap-1.5 border-primary/20 bg-primary/5 px-2 text-primary shadow-none hover:bg-primary/10 hover:text-primary sm:px-3"
                      >
                        <Eye aria-hidden="true" className="size-3.5 shrink-0" />
                        Open
                      </ButtonLink>
                      <a
                        href={`/api/documents/${v.id}/download`}
                        aria-label={`Download ${v.name}`}
                        title={`Download ${v.name}`}
                        className={buttonVariants({
                          variant: "secondary",
                          size: "sm",
                          className: "gap-1.5 px-2 text-muted-foreground shadow-none sm:px-3",
                        })}
                      >
                        <Download aria-hidden="true" className="size-3.5 shrink-0" />
                        <span className="sr-only sm:not-sr-only">Download</span>
                      </a>
                    </div>
                    {action && (
                      <span className="border-t border-border/60 pt-1.5 sm:ml-1 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3">
                        {action === "archive" ? (
                          <ArchiveButton id={v.id} />
                        ) : (
                          <RestoreButton id={v.id} />
                        )}
                      </span>
                    )}
                  </div>
                </TableCell>
              )}
              {action && !shared && (
                <TableCell className="px-4 text-right">
                  {action === "archive" ? <ArchiveButton id={v.id} /> : <RestoreButton id={v.id} />}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ) : (
    <p className="p-16 text-center text-sm text-muted-foreground">{empty}</p>
  );
}
