import { NextResponse } from "next/server";
import { loadFileRecord } from "@/lib/http/file-route";

import { getFloorImageRecord } from "@/features/properties/queries/property-floor-unit.queries";
import { logError } from "@/lib/logger";
import { getDocumentStorage } from "@/lib/storage/document-storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const record = await loadFileRecord(id, getFloorImageRecord);
  if (record instanceof NextResponse) return record;
  if (!record?.storageKey || !record.mimeType)
    return new NextResponse("Not found", { status: 404 });

  try {
    const body = await getDocumentStorage().get(record.storageKey);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": record.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; sandbox",
      },
    });
  } catch (error) {
    logError("Floor picture read failed", error, {
      operation: "floor_image_read",
      floorId: id,
    });
    return new NextResponse("Picture unavailable", { status: 404 });
  }
}
