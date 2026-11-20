import { NextResponse } from "next/server";
import { contentDisposition, loadFileRecord } from "@/lib/http/file-route";
import { getDownloadRecord } from "@/features/documents/queries/document.queries";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { logError } from "@/lib/logger";
import { sharedFileCategory } from "@/features/documents/lib/shared-files";
import { documentFileTypes } from "@/lib/storage/document-validation";

// Only these render safely in the browser; everything else always downloads.
const inlineTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadFileRecord(id, getDownloadRecord);
  if (record instanceof NextResponse) return record;
  if (!record) return new NextResponse("Not found", { status: 404 });
  try {
    const body = await getDocumentStorage().get(record.storageKey);
    const inline =
      new URL(request.url).searchParams.get("inline") === "1" &&
      inlineTypes.has(record.mimeType ?? "");
    const extension = documentFileTypes[record.mimeType ?? ""];
    const name =
      record.category === sharedFileCategory &&
      extension &&
      !record.name.toLowerCase().endsWith(`.${extension}`)
        ? `${record.name}.${extension}`
        : record.name;
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": record.mimeType || "application/octet-stream",
        "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", name),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // Same lock-down as the user document preview.
        ...(inline && {
          "Content-Security-Policy":
            "default-src 'none'; frame-ancestors 'self'; sandbox allow-modals allow-downloads",
        }),
      },
    });
  } catch (error) {
    logError("Document download failed", error, {
      operation: "document_download",
      documentId: id,
    });
    return new NextResponse("File unavailable", { status: 404 });
  }
}
