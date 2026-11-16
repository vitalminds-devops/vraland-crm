import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { Client } from "pg";
import { randomBytes } from "node:crypto";

export async function signIn(page: Page, identity: { email: string; password: string }) {
  const response = await page.request.post("/api/auth/sign-in/email", {
    headers: { "x-real-ip": "127." + [...randomBytes(3)].join(".") },
    data: { email: identity.email, password: identity.password },
  });
  expect(response.status(), await response.text()).toBe(200);
}

export async function query(sql: string, values: unknown[] = []) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  try {
    await client.connect();
    return (await client.query(sql, values)).rows;
  } finally {
    await client.end();
  }
}

export async function consentingContact(organizationId: string) {
  const [contact] = await query(
    `insert into contacts(organization_id,contact_code,first_name,last_name,email,mobile_phone_1,marketing_consent)
    values($1,'pw-recipient','Campaign','Recipient','recipient@example.invalid','+639171234567',true) returning id`,
    [organizationId],
  );
  return contact.id as string;
}
