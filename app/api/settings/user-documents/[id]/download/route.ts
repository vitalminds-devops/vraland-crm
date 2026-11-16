import { NextResponse } from "next/server";
import { contentDisposition, loadFileRecord } from "@/lib/http/file-route";
import { getUserDocumentFileRecord } from "@/features/settings/queries/settings.queries";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { logError } from "@/lib/logger";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadFileRecord(id, getUserDocumentFileRecord);
  if (record instanceof NextResponse) return record;
  if (!record) return new NextResponse("Not found", { status: 404 });

  try {
    const body = await getDocumentStorage().get(record.storageKey);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": record.mimeType || "application/octet-stream",
        "Content-Disposition": contentDisposition("attachment", record.name),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logError("User document download failed", error, {
      operation: "user_document_download",
      documentId: id,
    });
    return new NextResponse("File unavailable", { status: 404 });
  }
}
