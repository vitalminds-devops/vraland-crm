import { expect, it } from "vitest";
import { permissionKeys } from "./catalog";
import { permissionDetails } from "./permission-details";

const keys = new Set<string>(permissionKeys);

it("describes every permission by name, never by its key", () => {
  for (const [key, detail] of Object.entries(permissionDetails)) {
    const text = [detail.allows, ...detail.conditions].join(" ");
    const rawKeys = (text.match(/\b[a-z]+\.[a-z_]+\b/g) ?? []).filter((word) => keys.has(word));
    expect([key, rawKeys]).toEqual([key, []]);
    expect(detail.allows.length).toBeGreaterThan(0);
  }
});

it("says plainly when a permission is not used by any feature", () => {
  for (const detail of Object.values(permissionDetails))
    if ("unused" in detail) expect(detail.allows).toMatch(/^(Nothing|Intended)/);
});
