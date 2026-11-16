import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { ButtonLink } from "@/components/ui/button";
import { DocumentTable } from "../page";
import { listDocuments } from "@/features/documents/queries/document.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("documents.view");
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const data = await listDocuments({ page, archived: true });
  return (
    <PageContainer>
      <PageHeader
        title="Archive"
        actions={<BackButton fallbackHref="/documents" label="Back to documents" />}
      />
      <div className="mt-6 rounded-xl border bg-card">
        <DocumentTable rows={data.rows} action={data.canManage ? "restore" : undefined} />
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-sm">
          <span>
            {data.total} {data.total === 1 ? "document" : "documents"}
          </span>
          <div>
            {page > 1 && (
              <ButtonLink href={`/documents/archive?page=${page - 1}`} variant="secondary">
                Previous
              </ButtonLink>
            )}{" "}
            {page < data.pages && (
              <ButtonLink href={`/documents/archive?page=${page + 1}`} variant="secondary">
                Next
              </ButtonLink>
            )}
          </div>
        </footer>
      </div>
    </PageContainer>
  );
}
