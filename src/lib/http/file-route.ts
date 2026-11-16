import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError } from "@/lib/permissions/authorization";

/**
 * Loads the record behind a file route, answering 404 for a malformed id and
 * 401/403 instead of a 500 when the caller is signed out or not allowed.
 */
export async function loadFileRecord<T>(
  id: string,
  load: (id: string) => Promise<T | null | undefined>,
): Promise<T | NextResponse> {
  if (!z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  try {
    return (await load(id)) ?? new NextResponse("Not found", { status: 404 });
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    const signedOut = error.message === "Authentication is required.";
    return new NextResponse(signedOut ? "Authentication is required" : "Forbidden", {
      status: signedOut ? 401 : 403,
    });
  }
}

/** `Content-Disposition` with an ASCII fallback and the RFC 5987 UTF-8 name. */
export function contentDisposition(type: "attachment" | "inline", name: string) {
  const fallback = name.replaceAll(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
