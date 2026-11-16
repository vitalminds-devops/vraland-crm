import { test, expect } from "../fixtures/identity";
import { Client } from "pg";
test.use({ trace: "off", extraHTTPHeaders: { Origin: "http://127.0.0.1:3100" } });
test("recovery delivers to local SMTP and hides account existence", async ({
  request,
  identity,
}) => {
  const known = await request.post("/api/auth/request-password-reset", {
    data: { email: identity.email, redirectTo: "/reset-password" },
  });
  const unknown = await request.post("/api/auth/request-password-reset", {
    data: { email: "unknown-" + identity.email, redirectTo: "/reset-password" },
  });
  expect(known.status()).toBe(200);
  expect(unknown.status()).toBe(200);
  expect(await known.json()).toEqual(await unknown.json());
  try {
    await expect
      .poll(
        async () =>
          (
            await (
              await request.get("http://127.0.0.1:3101/messages", {
                params: { to: identity.email },
              })
            ).json()
          ).length,
      )
      .toBe(1);
    const mail = await (
      await request.get("http://127.0.0.1:3101/messages", { params: { to: identity.email } })
    ).json();
    expect(mail[0].raw).toContain("127.0.0.1:3100");
    expect(mail[0].to).toEqual([identity.email]);
  } finally {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        "delete from auth_verifications where value in(select id from auth_users where crm_user_id=$1)",
        [identity.userId],
      );
    } finally {
      await client.end();
    }
  }
});
