import { test, expect } from "../fixtures/identity";
import { randomBytes } from "node:crypto";
test.use({ trace: "off" });

test("production sign-in limiter rejects the fourth attempt from one controlled test IP", async ({
  request,
  identity,
}) => {
  const ip = "127." + [...randomBytes(3)].join(".");
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request.post("/api/auth/sign-in/email", {
      headers: { "x-real-ip": ip },
      data: { email: identity.email, password: "wrong-synthetic-password" },
    });
    expect(response.status()).toBe(401);
  }
  const limited = await request.post("/api/auth/sign-in/email", {
    headers: { "x-real-ip": ip },
    data: { email: identity.email, password: "wrong-synthetic-password" },
  });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()["x-retry-after"])).toBeGreaterThan(0);
  expect(await (await request.get("/api/auth/get-session")).json()).toBeNull();
});
