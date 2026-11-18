import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ContactsPageWrapper } from "../../../../app/(crm)/contacts/contacts-page-wrapper";
import type { Contact } from "./contact-row";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/contacts", async () => ({
  ...(await import("./contacts-table")),
  ...(await import("./contacts-grouped-by-broker")),
  ContactFilters: () => null,
  BrokerReassignModal: () => null,
}));

const contact: Contact = {
  id: "independent",
  firstName: "John",
  middleName: null,
  lastName: "Dela Cruz",
  email: null,
  mobilePhone1: null,
  mobilePhone2: null,
  mobilePhone3: null,
  preferredContactMethods: [],
  employmentType: "Employed",
  lifecycleStage: null,
  pipelineStage: "Opportunity",
  stageProbability: 10,
  assignedFirstName: "Ana",
  assignedLastName: "Santos",
  brokerUserId: "independent-agent",
  brokerFirstName: null,
  brokerLastName: null,
  approvalStatus: "approved",
  createdAt: "2026-01-01",
};
const props = {
  data: {
    rows: [
      contact,
      {
        ...contact,
        id: "brokered",
        firstName: "Maria",
        lastName: "Villanueva",
        assignedFirstName: "Leo",
        assignedLastName: "Reyes",
        brokerUserId: "broker",
        brokerFirstName: "Mira",
        brokerLastName: "Lim",
      },
      {
        ...contact,
        id: "unassigned",
        firstName: "Alex",
        lastName: "Garcia",
        assignedFirstName: null,
        assignedLastName: null,
        brokerUserId: null,
      },
    ],
    total: 3,
    page: 1,
    pages: 1,
  },
  brokers: [],
  canCreate: true,
  canEdit: false,
  canViewDocuments: false,
  canArchive: false,
  canReassign: false,
  isSuperAdmin: false,
  pageSize: 25,
  sort: "contact",
  dir: "asc",
  showAdditionalColumns: true,
};

it("shows assigned agents independently of broker assignment", () => {
  const html = renderToStaticMarkup(createElement(ContactsPageWrapper, props));
  expect(html).toContain("Assigned agent");
  expect(html).toContain("Agent: Ana Santos");
  expect(html).toContain("Broker: Mira Lim");
  expect(html).toContain("Agent: Unassigned");
  expect(html).toContain("No broker");
});

it("passes selected columns, sorting and page size through the page wrappers", () => {
  const html = renderToStaticMarkup(createElement(ContactsPageWrapper, props));
  expect(html).toContain("Employment Type");
  expect(html).toContain('aria-sort="ascending"');
  expect(html).toMatch(/<option[^>]*value="25"[^>]*selected=""[^>]*>25<\/option>/);
  expect(html).toContain('aria-pressed="true" aria-label="Toggle additional columns"');
});

it("keeps the filtered empty state actionable", () => {
  const html = renderToStaticMarkup(
    createElement(ContactsPageWrapper, {
      ...props,
      search: "missing",
      data: { ...props.data, rows: [], total: 0 },
    }),
  );
  expect(html).toContain("No matches");
  expect(html).toContain("Clear filters");
});
