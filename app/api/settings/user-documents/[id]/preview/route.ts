import { NextResponse } from "next/server";
import { contentDisposition, loadFileRecord } from "@/lib/http/file-route";
import { getUserDocumentFileRecord } from "@/features/settings/queries/settings.queries";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { logError } from "@/lib/logger";

const previewableTypes = new Set(["application/pdf", "image/jpeg", "image/png", "text/plain"]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadFileRecord(id, getUserDocumentFileRecord);
  if (record instanceof NextResponse) return record;
  if (!record) return new NextResponse("Not found", { status: 404 });
  if (!record.mimeType || !previewableTypes.has(record.mimeType))
    return new NextResponse("Preview unavailable for this file type", {
      status: 415,
    });

  try {
    const body = await getDocumentStorage().get(record.storageKey);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": record.mimeType,
        "Content-Disposition": contentDisposition("inline", record.name),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; sandbox",
      },
    });
  } catch (error) {
    logError("User document preview failed", error, {
      operation: "user_document_preview",
      documentId: id,
    });
    return new NextResponse("File unavailable", { status: 404 });
  }
}
