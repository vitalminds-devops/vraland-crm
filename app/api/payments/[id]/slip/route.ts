import { NextResponse } from "next/server";
import { getPaymentSlip } from "@/features/billing/queries/billing.queries";
import { contentDisposition, loadFileRecord } from "@/lib/http/file-route";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { logError } from "@/lib/logger";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadFileRecord(id, getPaymentSlip);
  if (record instanceof NextResponse) return record;
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
    logError("Transaction slip download failed", error, {
      operation: "payment_slip_download",
      paymentId: id,
    });
    return new NextResponse("File unavailable", { status: 404 });
  }
}
