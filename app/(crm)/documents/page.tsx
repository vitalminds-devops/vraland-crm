import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { FilterForm } from "@/components/common/filter-form";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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
import { getDocumentOptions, listDocuments } from "@/features/documents/queries/document.queries";
import { formatContactName } from "@/features/contacts/lib/helpers";
import { documentTypeLabel, documentTypeOptions } from "@/features/contacts/lib/contact-options";
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
    type?: string;
  }>;
}) {
  await requirePagePermission("documents.view");
  const q = await searchParams;
  const page = Math.max(1, Number(q.page) || 1);
  const [data, options] = await Promise.all([
    listDocuments({
      page,
      search: q.search,
      documentType: q.type,
    }),
    getDocumentOptions(),
  ]);
  const pageHref = (target: number) =>
    `/documents?${new URLSearchParams({
      ...(q.search ? { search: q.search } : {}),
      ...(q.type ? { type: q.type } : {}),
      page: String(target),
    }).toString()}`;

  return (
    <PageContainer>
      <PageHeader
        title="Documents"
        description="Client, property and deal files"
        actions={
          <>
            <ButtonLink href="/documents/archive" variant="secondary">
              Archive
            </ButtonLink>
            {data.canManage && <DocumentUpload options={options} />}
          </>
        }
      />
      <div className="mt-6 rounded-xl border bg-card">
        <FilterForm className="flex flex-col gap-2 border-b p-4 lg:flex-row">
          <label className="relative min-w-0 lg:flex-1">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              name="search"
              defaultValue={q.search}
              placeholder="Search by file, client or deal"
              aria-label="Search documents"
              className={`${input} pl-9`}
            />
          </label>
          <NativeSelect
            name="type"
            aria-label="Type"
            defaultValue={q.type}
            className={input}
            wrapperClassName="lg:w-64 lg:shrink-0"
          >
            <NativeSelectOption value="">All types</NativeSelectOption>
            {documentTypeOptions.map((item) => (
              <NativeSelectOption key={item.documentType} value={item.documentType}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {(q.search || q.type) && (
            <ButtonLink href="/documents" variant="ghost" className="shrink-0">
              Clear
            </ButtonLink>
          )}
        </FilterForm>
        <DocumentTable
          rows={data.rows}
          action={data.canManage ? "archive" : undefined}
          empty={q.search || q.type ? "No documents match." : "No documents yet."}
        />
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-sm">
          <span>
            {data.total} {data.total === 1 ? "document" : "documents"}
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
  empty = "No documents yet.",
}: {
  rows: Awaited<ReturnType<typeof listDocuments>>["rows"];
  empty?: string;
  /** The per-row button: archive on the main list, restore on the archive. */
  action?: "archive" | "restore";
}) {
  return rows.length ? (
    <div className="overflow-x-auto">
      <Table className="w-full text-left text-sm">
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="px-4 py-3">Document</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Created</TableHead>
            {action && (
              <TableHead className="px-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((v) => (
            <TableRow key={v.id} className="border-t">
              <TableCell className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-content-center rounded-lg bg-muted text-muted-foreground">
                    <FileText aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <Link href={`/documents/${v.id}`} className="font-medium hover:underline">
                      {v.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {fileKind(v.mimeType)} · {size(v.fileSizeBytes)}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs">
                  {documentTypeLabel(v.documentType)}
                </span>
              </TableCell>
              <TableCell>
                {v.contactId && v.contactFirstName ? (
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
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {v.createdAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </TableCell>
              {action && (
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
