import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions/authorization", () => ({
  AuthorizationError: class AuthorizationError extends Error {},
}));

const { AuthorizationError } = await import("@/lib/permissions/authorization");
const { contentDisposition, loadFileRecord } = await import("./file-route");

const id = "7f4a3c1e-2b6d-4e8f-9a0b-1c2d3e4f5a6b";

describe("loadFileRecord", () => {
  it("404s a malformed id without loading", async () => {
    const load = vi.fn();
    const result = await loadFileRecord("../etc", load);
    expect((result as Response).status).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });

  it("maps authorization failures to 401 and 403", async () => {
    const signedOut = await loadFileRecord(id, async () => {
      throw new AuthorizationError("Authentication is required.");
    });
    const forbidden = await loadFileRecord(id, async () => {
      throw new AuthorizationError("nope");
    });
    expect((signedOut as Response).status).toBe(401);
    expect((forbidden as Response).status).toBe(403);
  });

  it("returns the record, or 404 when there is none", async () => {
    expect(await loadFileRecord(id, async () => ({ name: "a" }))).toEqual({ name: "a" });
    expect(((await loadFileRecord(id, async () => null)) as Response).status).toBe(404);
  });
});

describe("contentDisposition", () => {
  it("keeps an ASCII fallback and encodes RFC 5987 specials", () => {
    expect(contentDisposition("attachment", `John's "deal" – 5A.pdf`)).toBe(
      `attachment; filename="John's _deal_ _ 5A.pdf"; filename*=UTF-8''John%27s%20%22deal%22%20%E2%80%93%205A.pdf`,
    );
  });
});
