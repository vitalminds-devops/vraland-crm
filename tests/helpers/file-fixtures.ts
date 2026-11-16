import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { test as identityTest, expect } from "../fixtures/identity";

export const fileName = 'Quarterly "report" résumé.pdf';
export const fileBytes = Buffer.from("%PDF-1.7\nPlaywright file fixture\n\0\xff", "utf8");
export const fileRoutes = [
  {
    name: "development cover",
    path: "/api/developments/ID/cover",
    record: "development",
    image: true,
  },
  { name: "floor image", path: "/api/properties/floors/ID/image", record: "floor", image: true },
  { name: "unit image", path: "/api/properties/units/ID/image", record: "unit", image: true },
  {
    name: "document download",
    path: "/api/documents/ID/download",
    record: "document",
    image: false,
  },
  {
    name: "user document download",
    path: "/api/settings/user-documents/ID/download",
    record: "userDocument",
    image: false,
  },
  {
    name: "user document preview",
    path: "/api/settings/user-documents/ID/preview",
    record: "userDocument",
    image: false,
  },
] as const;
type Records = Record<(typeof fileRoutes)[number]["record"] | "property", string>;
type Files = {
  client: Client;
  seed: (organizationId?: string, userId?: string, missingStorage?: boolean) => Promise<Records>;
  foreignOrganization: () => Promise<{ organizationId: string; userId: string }>;
};

export const test = identityTest.extend<{ files: Files }>({
  files: async ({ identity }, provide) => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const createdPaths: string[] = [];
    const foreignOrganizations: string[] = [];
    try {
      await mkdir(resolve(".data/documents"), { recursive: true });
      await provide({
        client,
        async foreignOrganization() {
          const organizationId = randomUUID(),
            userId = randomUUID();
          await client.query("insert into organizations(id,name,code) values($1,$2,$3)", [
            organizationId,
            "File isolation test",
            "pw-files-" + organizationId,
          ]);
          foreignOrganizations.push(organizationId);
          await client.query(
            "insert into users(id,organization_id,email,first_name,last_name) values($1,$2,$3,$4,$5)",
            [userId, organizationId, userId + "@example.invalid", "Foreign", "Tester"],
          );
          return { organizationId, userId };
        },
        async seed(
          organizationId = identity.organizationId,
          userId = identity.userId,
          missingStorage = false,
        ) {
          const ids: Records = {
            development: randomUUID(),
            property: randomUUID(),
            floor: randomUUID(),
            unit: randomUUID(),
            document: randomUUID(),
            userDocument: randomUUID(),
          };
          const key = "pw-files-" + randomUUID() + ".bin";
          if (!missingStorage) {
            const path = resolve(".data/documents", key);
            await writeFile(path, fileBytes, { flag: "wx" });
            createdPaths.push(path);
          }
          await client.query(
            "insert into developments(id,organization_id,code,name,cover_image_storage_key,cover_image_mime_type) values($1::uuid,$2,$1::text,$3,$4,$5)",
            [ids.development, organizationId, "File development", key, "image/png"],
          );
          await client.query(
            "insert into properties(id,organization_id,development_id,property_code,title,property_type,cover_image_storage_key,cover_image_mime_type) values($1::uuid,$2,$3,$1::text,$4,$5,$6,$7)",
            [
              ids.property,
              organizationId,
              ids.development,
              "File building",
              "condominium",
              key,
              "image/png",
            ],
          );
          await client.query(
            "insert into floors(id,building_id,level,label,image_storage_key,image_mime_type) values($1,$2,1,$3,$4,$5)",
            [ids.floor, ids.property, "File floor", key, "image/png"],
          );
          await client.query(
            "insert into units(id,building_id,floor_id,code,image_storage_key,image_mime_type) values($1,$2,$3,$4,$5,$6)",
            [ids.unit, ids.property, ids.floor, "1A", key, "image/png"],
          );
          await client.query(
            "insert into documents(id,organization_id,name,storage_key,mime_type) values($1,$2,$3,$4,$5)",
            [ids.document, organizationId, fileName, key, "application/pdf"],
          );
          await client.query(
            "insert into documents(id,organization_id,user_id,name,storage_key,mime_type) values($1,$2,$3,$4,$5,$6)",
            [ids.userDocument, organizationId, userId, fileName, key, "application/pdf"],
          );
          return ids;
        },
      });
    } finally {
      try {
        for (const path of createdPaths) await unlink(path);
        for (const id of foreignOrganizations)
          await client.query("delete from organizations where id=$1 and code=$2", [
            id,
            "pw-files-" + id,
          ]);
      } finally {
        await client.end();
      }
    }
  },
});
export { expect };
