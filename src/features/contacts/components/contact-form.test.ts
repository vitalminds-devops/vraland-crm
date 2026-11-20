import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ContactForm } from "./contact-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../actions/contact.actions", () => ({
  checkContactDuplicate: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
}));
vi.mock("@/features/deals/actions/deal.actions", () => ({
  createDealForContact: vi.fn(),
  saveDealForContact: vi.fn(),
}));
const options = { assignees: [], dealStages: [], developments: [] };

it("omits address and property interest when creating", () => {
  const html = renderToStaticMarkup(createElement(ContactForm, { options }));
  expect(html).not.toContain('name="currentProvince"');
  expect(html).not.toContain('name="purchaseType"');
  expect(html).not.toContain("Select budget");
});
it("keeps address and property interest when editing", () => {
  const html = renderToStaticMarkup(createElement(ContactForm, { contactId: "contact", options }));
  expect(html).toContain('name="currentProvince"');
  expect(html).toContain('name="purchaseType"');
  expect(html).toContain("Select budget");
});
