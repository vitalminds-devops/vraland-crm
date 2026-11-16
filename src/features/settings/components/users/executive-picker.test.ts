import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExecutivePicker } from "./executive-picker";
import type { UserRow } from "./user-types";

function user(id: string, slug: string, status = "active"): UserRow {
  return {
    id,
    email: id + "@example.com",
    firstName: id,
    lastName: "User",
    phone: null,
    status,
    lastLoginAt: null,
    brokerId: null,
    dataScope: "own",
    avatarUrl: null,
    roles: [{ id: slug, slug, name: slug }],
    documents: [],
  };
}
const users = [
  user("Alice", "broker"),
  user("Bob", "license-broker"),
  user("Inactive", "broker", "inactive"),
  user("Executive", "sales-executive"),
];

describe("broker picker", () => {
  it("renders broker checkboxes and visible removable selections", () => {
    const html = renderToStaticMarkup(
      createElement(ExecutivePicker, {
        users,
        managerRoles: ["master-broker"],
        selected: ["Alice", "Bob"],
        onChange: () => {},
        kind: "brokers",
      }),
    );
    expect(html).toContain('aria-label="Selected brokers"');
    expect(html).toContain('aria-label="Search brokers"');
    expect(html).toContain('aria-label="Remove Alice User (Alice@example.com)"');
    expect(html).toContain('aria-label="Remove Bob User (Bob@example.com)"');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).not.toContain("Inactive@example.com");
    expect(html).not.toContain("Executive@example.com");
  });
  it("preserves the existing sales executive picker by default", () => {
    const html = renderToStaticMarkup(
      createElement(ExecutivePicker, {
        users,
        managerRoles: ["broker"],
        selected: [],
        onChange: () => {},
      }),
    );
    expect(html).toContain("Select sales executives");
    expect(html).toContain("Executive@example.com");
    expect(html).not.toContain("Alice@example.com");
  });
});
