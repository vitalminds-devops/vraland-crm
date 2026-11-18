import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ContactRow, type Contact } from "./contact-row";
import type { MenuSection } from "@/components/ui/row-actions-menu";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/row-actions-menu", () => ({
  RowActionsMenu: ({ sections }: { sections: MenuSection[] }) =>
    createElement(
      "div",
      null,
      sections
        .flatMap((section) => section.items)
        .map((item) => createElement("a", { key: item.label, href: item.href }, item.label)),
    ),
}));

const contact: Contact = {
  id: "client",
  firstName: "Juan",
  middleName: null,
  lastName: "Dela Cruz",
  email: "juan@example.invalid",
  mobilePhone1: null,
  mobilePhone2: null,
  mobilePhone3: null,
  preferredContactMethods: [],
  employmentType: null,
  lifecycleStage: null,
  pipelineStage: null,
  stageProbability: null,
  assignedFirstName: null,
  assignedLastName: null,
  brokerFirstName: null,
  brokerLastName: null,
  approvalStatus: "approved",
  createdAt: "2026-01-01",
};

it.each([true, false])(
  "shows Documents only with requirements access (%s) and removes contact shortcuts",
  (canViewDocuments) => {
    const html = renderToStaticMarkup(
      createElement(ContactRow, { contact, canViewDocuments, canEdit: true }),
    );
    expect(html.includes('href="/contacts/client/documents"')).toBe(canViewDocuments);
    expect(html).toContain("View contact");
    expect(html).toContain("Edit contact");
    expect(html).not.toContain("Email contact");
    expect(html).not.toContain("Copy email");
    expect(html).not.toContain("Copy contact code");
  },
);

it("keeps an agent without a broker visible in the table and mobile contact details", () => {
  const html = renderToStaticMarkup(
    createElement(ContactRow, {
      contact: { ...contact, assignedFirstName: "Ana", assignedLastName: "Santos" },
    }),
  );
  expect(html).toContain("Agent: Ana Santos");
  expect(html).toMatch(/md:table-cell[^>]*>Ana Santos/);
  expect(html).toContain("No broker");
  expect(html).not.toContain("Unassigned");
});

it("distinguishes an unassigned contact from an agent without a broker", () => {
  const html = renderToStaticMarkup(createElement(ContactRow, { contact }));
  expect(html).toContain("Agent: Unassigned");
  expect(html).toContain("No broker");
});
