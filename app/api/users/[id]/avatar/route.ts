import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { avatarMimeType } from "@/features/account/lib/avatar";
import { loadFileRecord } from "@/lib/http/file-route";
import { logError } from "@/lib/logger";
import { requireAuthorizationContext } from "@/lib/permissions/authorization";
import { getDocumentStorage } from "@/lib/storage/document-storage";

/** Anyone signed in to the organization may see a colleague's photo. */
async function loadAvatar(id: string) {
  const context = await requireAuthorizationContext();
  const [row] = await db
    .select({ storageKey: users.avatarUrl })
    .from(users)
    .where(
      and(
        eq(users.id, id),
        eq(users.organizationId, context.organizationId),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  return row;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadFileRecord(id, loadAvatar);
  if (record instanceof NextResponse) return record;
  const mimeType = record.storageKey && avatarMimeType(record.storageKey);
  if (!record.storageKey || !mimeType) return new NextResponse("Not found", { status: 404 });

  try {
    const body = await getDocumentStorage().get(record.storageKey);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": mimeType,
        // The URL carries the photo's version, so a new upload is a new URL.
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; sandbox",
      },
    });
  } catch (error) {
    logError("Avatar read failed", error, { operation: "avatar_read", userId: id });
    return new NextResponse("Picture unavailable", { status: 404 });
  }
}
