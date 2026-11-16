import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import {
  permissionCatalog,
  roleDataScopeDefaults,
  rolePermissionDefaults,
  type RoleSlug,
} from "@/lib/permissions/catalog";

const migration = readFileSync(
  resolve(__dirname, "0050_complete_data_access_defaults.sql"),
  "utf8",
);
const scopeKey = {
  own: "records.view_own",
  broker_team: "records.view_team",
  organization: "records.view_all",
};

/** Each INSERT block: the keys it grants, the roles it grants them to, and the key those roles must still hold. */
const blocks = [
  ...migration.matchAll(
    /p\.key (?:= '([^']+)'|IN \(([^)]*)\))\s*WHERE r\.slug IN \(([^)]*)\)[\s\S]*?held\.key = '([^']+)'/g,
  ),
].map(([, one, many, slugs, held]) => ({
  keys: one ? [one] : [...many.matchAll(/'([^']+)'/g)].map(([, key]) => key),
  slugs: [...slugs.matchAll(/'([^']+)'/g)].map(([, slug]) => slug),
  held,
}));

it("brings every built-in role holding its default broadest key up to its catalog defaults", () => {
  for (const slug of Object.keys(rolePermissionDefaults) as RoleSlug[]) {
    const defaults = (rolePermissionDefaults[slug] as readonly string[]).filter((key) =>
      (permissionCatalog.records as readonly string[]).includes(key),
    );
    const broadest = scopeKey[roleDataScopeDefaults[slug]];
    const granted = blocks
      .filter((block) => block.slugs.includes(slug))
      .flatMap((block) => {
        expect([slug, block.held]).toEqual([slug, broadest]);
        return block.keys;
      });
    // Migration 0048 already granted the broadest key; this adds the rest of the defaults.
    expect([slug, [broadest, ...granted].sort()]).toEqual([slug, [...defaults].sort()]);
  }
});
