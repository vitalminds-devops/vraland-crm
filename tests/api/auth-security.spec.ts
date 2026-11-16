import { test, expect } from "../fixtures/identity";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

// Auth requests contain passwords, cookies and reset tokens; never record them.
test.use({ extraHTTPHeaders: { Origin: "http://127.0.0.1:3100" }, trace: "off" });
const auth = "/api/auth";
type Identity = { email: string; password: string; userId: string; organizationId: string };
async function login(request: APIRequestContext, identity: Identity) {
  expect(
    (
      await request.post(`${auth}/sign-in/email`, {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
}
async function error(response: APIResponse, status: number, code?: string) {
  expect(response.status()).toBe(status);
  if (code) expect((await response.json()).code).toBe(code);
}
async function database<T>(operation: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}
function noCredentials(value: unknown) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    expect(
      ["password", "accessToken", "refreshToken", "idToken"].includes(key),
      `sensitive field ${key}`,
    ).toBe(false);
    noCredentials(child);
  }
}

test("missing and forged cookies cannot authenticate", async ({ request }) => {
  expect(await (await request.get(`${auth}/get-session`)).json()).toBeNull();
  expect(
    await (
      await request.get(`${auth}/get-session`, {
        headers: { Cookie: "__Secure-better-auth.session_token=forged.invalid" },
      })
    ).json(),
  ).toBeNull();
  await error(await request.get(`${auth}/list-sessions`), 401);
  await error(await request.get(`${auth}/list-accounts`), 401);
});

test("invalid credentials and malformed sign-in never create a session", async ({
  request,
  identity,
}) => {
  for (const email of [identity.email, `missing-${randomUUID()}@example.invalid`]) {
    await error(
      await request.post(`${auth}/sign-in/email`, { data: { email, password: "wrong-password" } }),
      401,
      "INVALID_EMAIL_OR_PASSWORD",
    );
  }
  await error(
    await request.post(`${auth}/sign-in/email`, { data: { email: "invalid", password: 42 } }),
    400,
  );
  expect(await (await request.get(`${auth}/get-session`)).json()).toBeNull();
});

test("public sign-up is disabled and cannot create an account", async ({ request, identity }) => {
  const email = `signup-${randomUUID()}@example.invalid`;
  await error(
    await request.post(`${auth}/sign-up/email`, {
      data: { name: "Forbidden signup", email, password: identity.password },
    }),
    400,
  );
  expect(
    await database(
      async (c) => (await c.query("select id from auth_users where email=$1", [email])).rowCount,
    ),
  ).toBe(0);
});

for (const state of ["inactive-user", "deleted-user", "inactive-organization"] as const) {
  test(`${state} cannot create a session`, async ({ request, identity }) => {
    await database(async (c) => {
      if (state === "inactive-user")
        await c.query("update users set status='inactive' where id=$1", [identity.userId]);
      if (state === "deleted-user")
        await c.query("update users set deleted_at=now() where id=$1", [identity.userId]);
      if (state === "inactive-organization")
        await c.query("update organizations set is_active=false where id=$1", [
          identity.organizationId,
        ]);
    });
    await error(
      await request.post(`${auth}/sign-in/email`, {
        data: { email: identity.email, password: identity.password },
      }),
      403,
    );
    expect(await (await request.get(`${auth}/get-session`)).json()).toBeNull();
  });
}

test("password changes enforce inclusive 12 and 128 character limits and verify current password", async ({
  request,
  identity,
}) => {
  await login(request, identity);
  expect(
    (
      await request.post(`${auth}/verify-password`, { data: { password: identity.password } })
    ).status(),
  ).toBe(200);
  for (const [length, code] of [
    [11, "PASSWORD_TOO_SHORT"],
    [129, "PASSWORD_TOO_LONG"],
  ] as const) {
    await error(
      await request.post(`${auth}/change-password`, {
        data: { currentPassword: identity.password, newPassword: "A".repeat(length) },
      }),
      400,
      code,
    );
  }
  await error(
    await request.post(`${auth}/change-password`, {
      data: { currentPassword: "wrong-password", newPassword: "A".repeat(12) },
    }),
    400,
    "INVALID_PASSWORD",
  );
  let currentPassword = identity.password;
  for (const length of [12, 128]) {
    const newPassword = "A".repeat(length);
    const result = await request.post(`${auth}/change-password`, {
      data: { currentPassword, newPassword },
    });
    expect(result.status()).toBe(200);
    noCredentials(await result.json());
    await request.post(`${auth}/sign-out`, { data: {} });
    await login(request, { ...identity, password: newPassword });
    currentPassword = newPassword;
  }
});

test("reset tokens enforce limits, expiration and one-use, and revoke existing sessions", async ({
  request,
  identity,
}) => {
  await login(request, identity);
  const token = randomUUID(),
    expired = randomUUID();
  await database(async (c) => {
    const { rows } = await c.query("select id from auth_users where crm_user_id=$1", [
      identity.userId,
    ]);
    for (const [value, seconds] of [
      [token, 3600],
      [expired, -60],
    ] as const)
      await c.query(
        "insert into auth_verifications(id,identifier,value,expires_at) values($1,$2,$3,now()+$4*interval '1 second')",
        [randomUUID(), `reset-password:${value}`, rows[0].id, seconds],
      );
  });
  try {
    for (const [length, code] of [
      [11, "PASSWORD_TOO_SHORT"],
      [129, "PASSWORD_TOO_LONG"],
    ] as const)
      await error(
        await request.post(`${auth}/reset-password`, {
          data: { token, newPassword: "B".repeat(length) },
        }),
        400,
        code,
      );
    await error(
      await request.post(`${auth}/reset-password`, {
        data: { token: expired, newPassword: "B".repeat(12) },
      }),
      400,
      "INVALID_TOKEN",
    );
    expect(
      (
        await request.post(`${auth}/reset-password`, {
          data: { token, newPassword: "B".repeat(12) },
        })
      ).status(),
    ).toBe(200);
    expect(await (await request.get(`${auth}/get-session`)).json()).toBeNull();
    await error(
      await request.post(`${auth}/reset-password`, {
        data: { token, newPassword: "C".repeat(12) },
      }),
      400,
      "INVALID_TOKEN",
    );
    await login(request, { ...identity, password: "B".repeat(12) });
  } finally {
    await database(async (c) => {
      await c.query("delete from auth_verifications where identifier=any($1::text[])", [
        [`reset-password:${token}`, `reset-password:${expired}`],
      ]);
    });
  }
});

test("expired sessions are rejected by auth and protected APIs", async ({ request, identity }) => {
  await login(request, identity);
  await database(async (c) => {
    await c.query(
      "update auth_sessions set expires_at=now()-interval '1 minute' where user_id in(select id from auth_users where crm_user_id=$1)",
      [identity.userId],
    );
  });
  expect(await (await request.get(`${auth}/get-session`)).json()).toBeNull();
  expect((await request.get("/api/contacts/export")).status()).toBe(401);
});

for (const endpoint of ["revoke-session", "revoke-sessions", "revoke-other-sessions"]) {
  test(`${endpoint} invalidates only its intended sessions`, async ({
    request,
    playwright,
    identity,
    baseURL,
  }) => {
    await login(request, identity);
    const other = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL! },
    });
    try {
      await login(other, identity);
      const sessions = await (await request.get(`${auth}/list-sessions`)).json();
      expect(sessions).toHaveLength(2);
      const target = (await (await other.get(`${auth}/get-session`)).json()).session.token;
      expect(
        (
          await request.post(`${auth}/${endpoint}`, {
            data: endpoint === "revoke-session" ? { token: target } : {},
          })
        ).status(),
      ).toBe(200);
      expect(await (await other.get(`${auth}/get-session`)).json()).toBeNull();
      const own = await (await request.get(`${auth}/get-session`)).json();
      if (endpoint === "revoke-sessions") expect(own).toBeNull();
      else expect(own.user.email).toBe(identity.email);
    } finally {
      await other.dispose();
    }
  });
}

test("untrusted origins and redirect destinations cannot mutate authentication", async ({
  request,
  identity,
}) => {
  await error(
    await request.post(`${auth}/sign-in/email`, {
      headers: { Origin: "https://attacker.invalid" },
      data: { email: identity.email, password: identity.password },
    }),
    403,
  );
  await login(request, identity);
  await error(
    await request.post(`${auth}/sign-out`, {
      headers: { Origin: "https://attacker.invalid" },
      data: {},
    }),
    403,
  );
  await error(
    await request.post(`${auth}/request-password-reset`, {
      data: { email: identity.email, redirectTo: "https://attacker.invalid/reset" },
    }),
    403,
  );
  expect((await (await request.get(`${auth}/get-session`)).json()).user.email).toBe(identity.email);
});

test("account responses omit credential secrets and input-only CRM identity cannot be changed", async ({
  request,
  identity,
}) => {
  await login(request, identity);
  for (const path of ["get-session", "list-sessions", "list-accounts"]) {
    const result = await request.get(`${auth}/${path}`);
    expect(result.status()).toBe(200);
    noCredentials(await result.json());
  }
  const result = await request.post(`${auth}/update-user`, {
    data: { name: "Updated tester", crmUserId: randomUUID() },
  });
  expect(result.status()).toBe(400);
  const unchanged = await (await request.get(`${auth}/get-session`)).json();
  expect(unchanged.user.crmUserId).toBe(identity.userId);
  expect(
    (await request.post(`${auth}/update-user`, { data: { name: "Updated tester" } })).status(),
  ).toBe(200);
  const session = await (await request.get(`${auth}/get-session`)).json();
  expect(session.user.name).toBe("Updated tester");
  expect(session.user.crmUserId).toBe(identity.userId);
});

test("configured and disabled account operations have explicit contracts", async ({
  request,
  identity,
}) => {
  await login(request, identity);
  const accounts = await (await request.get(`${auth}/list-accounts`)).json();
  expect(accounts).toHaveLength(1);
  const accountId = accounts[0].id;
  const cases: [string, object, number, string?][] = [
    [
      "change-email",
      { newEmail: `changed-${randomUUID()}@example.invalid` },
      400,
      "CHANGE_EMAIL_DISABLED",
    ],
    ["delete-user", { password: identity.password }, 404],
    ["unlink-account", { accountId }, 400, "FAILED_TO_UNLINK_LAST_ACCOUNT"],
    ["update-session", {}, 400],
    ["link-social", { provider: "google" }, 404],
    ["sign-in/social", { provider: "google" }, 404],
    ["send-verification-email", { email: identity.email }, 400, "VERIFICATION_EMAIL_NOT_ENABLED"],
    ["get-access-token", { accountId }, 400],
    ["refresh-token", { accountId }, 400],
  ];
  for (const [path, data, status, code] of cases)
    await test.step(path, async () => {
      await error(await request.post(`${auth}/${path}`, { data }), status, code);
    });
  await error(
    await request.get(`${auth}/delete-user/callback`, { params: { token: "invalid" } }),
    404,
  );
  await error(await request.get(`${auth}/account-info`, { params: { accountId: "missing" } }), 400);
  await error(await request.get(`${auth}/verify-email`, { params: { token: "invalid" } }), 401);
  const reset = await request.get(`${auth}/reset-password/invalid`, {
    params: { callbackURL: "http://127.0.0.1:3100/reset-password" },
    maxRedirects: 0,
  });
  expect(reset.status()).toBe(302);
  expect(new URL(reset.headers().location).searchParams.get("error")).toBe("INVALID_TOKEN");
  const callback = await request.get(`${auth}/callback/google`, { maxRedirects: 0 });
  expect(callback.status()).toBe(302);
  expect(await (await request.get(`${auth}/ok`)).json()).toEqual({ ok: true });
  const page = await request.get(`${auth}/error`);
  expect(page.status()).toBe(200);
  expect(page.headers()["content-type"]).toContain("text/html");
});

test("unknown reset recipient gets a generic successful response without exposing identity", async ({
  request,
}) => {
  const response = await request.post(`${auth}/request-password-reset`, {
    data: { email: `missing-${randomUUID()}@example.invalid` },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    status: true,
    message: "If this email exists in our system, check your email for the reset link",
  });
});
