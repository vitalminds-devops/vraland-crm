import { test, expect } from "../fixtures/identity";
test.use({ extraHTTPHeaders: { Origin: "http://127.0.0.1:3100" }, trace: "off" });

test("POST session endpoint rejects refresh without configured deferred refresh", async ({
  request,
}) => {
  const response = await request.post("/api/auth/get-session", { data: {} });
  expect(response.status()).toBe(405);
  expect((await response.json()).code).toBe("METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED");
});

test("OAuth POST callback normalizes to local GET without contacting an unconfigured provider", async ({
  request,
}) => {
  const response = await request.post("/api/auth/callback/google", {
    form: { error: "access_denied", state: "synthetic-state" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(302);
  const destination = new URL(response.headers().location);
  expect(destination.origin).toBe("http://127.0.0.1:3100");
  expect(destination.pathname).toBe("/api/auth/callback/google");
  expect(destination.searchParams.get("error")).toBe("access_denied");
});
