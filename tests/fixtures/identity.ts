import { test as base, expect } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { Client } from "pg";
import { hashPassword } from "better-auth/crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { verifyDatabase, verifyConnectedDatabase } from "../helpers/environment";
import {
  rolePermissionDefaults,
  roleDataScopeDefaults,
  type RoleSlug,
} from "../../src/lib/permissions/catalog";
export const test = base.extend<{
  identity: { email: string; password: string; organizationId: string; userId: string };
  role: RoleSlug;
}>({
  extraHTTPHeaders: async ({}, provide) => {
    await provide({ "x-real-ip": "127." + [...randomBytes(3)].join(".") });
  },
  request: async ({ playwright, baseURL, extraHTTPHeaders }, provide) => {
    const context = await playwright.request.newContext({ baseURL, extraHTTPHeaders });
    // The production auth limiter trusts the reverse-proxy IP header. Isolate
    // unrelated auth scenarios; explicit IPs remain available for limiter tests.
    const isolated = new Proxy(context, {
      get(target, key) {
        const value = Reflect.get(target, key);
        if (typeof value !== "function") return value;
        if (["get", "post", "put", "patch", "delete", "head", "fetch"].includes(String(key)))
          return (url: string, options: { headers?: Record<string, string> } = {}) =>
            value.call(target, url, {
              ...options,
              headers: { "x-real-ip": "127." + [...randomBytes(3)].join("."), ...options.headers },
            });
        return value.bind(target);
      },
    });
    try {
      await provide(isolated);
    } finally {
      await context.dispose();
    }
  },
  role: ["administrator", { option: true }],
  identity: async ({ role }, provide) => {
    await verifyDatabase();
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const id = randomUUID(),
      user = randomUUID(),
      auth = randomUUID(),
      roleId = randomUUID();
    const email = "pw-" + user + "@example.invalid",
      password = randomUUID() + "Aa1!";
    const manifest = resolve("tests/.auth/manifests", id + ".json");
    try {
      await verifyConnectedDatabase(client);
      await client.query("BEGIN");
      await client.query("insert into organizations(id,name,code) values($1,$2,$3)", [
        id,
        "Playwright " + id,
        "pw-" + id,
      ]);
      await client.query(
        "insert into users(id,organization_id,email,first_name,last_name) values($1,$2,$3,$4,$5)",
        [user, id, email, "Playwright", "Tester"],
      );
      await client.query(
        "insert into roles(id,organization_id,name,slug,data_scope) values($1,$2,$3,$3,$4)",
        [roleId, id, role, roleDataScopeDefaults[role]],
      );
      await client.query(
        "insert into role_permissions(role_id,permission_id) select $1,id from permissions where key=any($2::text[])",
        [roleId, rolePermissionDefaults[role]],
      );
      await client.query("insert into user_roles(user_id,role_id) values($1,$2)", [user, roleId]);
      await client.query("insert into auth_users(id,name,email,crm_user_id) values($1,$2,$3,$4)", [
        auth,
        "Playwright Tester",
        email,
        user,
      ]);
      await client.query(
        "insert into auth_accounts(id,issuer,account_id,provider_id,user_id,password) values($1,$2,$3,$4,$3,$5)",
        [randomUUID(), "local:credential", auth, "credential", await hashPassword(password)],
      );
      await client.query("COMMIT");
      await mkdir(resolve("tests/.auth/manifests"), { recursive: true });
      await writeFile(
        manifest,
        JSON.stringify({ organizationId: id, organizationCode: "pw-" + id, userId: user }),
        { flag: "wx" },
      );
      await provide({ email, password, organizationId: id, userId: user });
    } finally {
      try {
        await client.query("ROLLBACK");
        await verifyConnectedDatabase(client);
        const owned = await client.query("select id from organizations where id=$1 and code=$2", [
          id,
          "pw-" + id,
        ]);
        if (owned.rowCount) {
          const files = await client.query<{ key: string }>(
            `select storage_key as key from documents where organization_id=$1
 union select cover_image_storage_key from developments where organization_id=$1
 union select cover_image_storage_key from properties where organization_id=$1
 union select f.image_storage_key from floors f join properties p on p.id=f.building_id where p.organization_id=$1
 union select u.image_storage_key from units u join properties p on p.id=u.building_id where p.organization_id=$1`,
            [id],
          );
          const root = resolve(".data/documents");
          // Application uploads are namespaced by this newly-created organization UUID.
          // Other keys (including file fixtures) belong to their creator's exact-key cleanup.
          for (const { key } of files.rows) {
            if (!key?.startsWith(id + "/")) continue;
            const file = resolve(root, key);
            if (!file.startsWith(root + sep))
              throw new Error("Refusing storage cleanup outside document root");
            await unlink(file).catch((error) => {
              if (error.code !== "ENOENT") throw error;
            });
          }
          // Inventory owned by these deals restricts their deletion (migration 0042).
          for (const table of ["units", "parking_slots"])
            await client.query(
              `update ${table} set reserved_deal_id=null
 where reserved_deal_id in (select id from deals where organization_id=$1)`,
              [id],
            );
          // Payments and broker references intentionally restrict parent deletion.
          for (const table of ["payments", "bills", "deals", "contacts"])
            await client.query(`delete from ${table} where organization_id=$1`, [id]);
        }
        // Only this fixture-created organization is eligible for cascading cleanup.
        await client.query("delete from organizations where id=$1 and code=$2", [id, "pw-" + id]);
        await unlink(manifest).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      } finally {
        await client.end();
      }
    }
  },
});
export { expect };
