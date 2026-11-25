import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import PaymentsPage from "../../../../app/(crm)/payments/page";

vi.mock("@/lib/permissions/authorization", () => ({ requirePagePermission: async () => ({}) }));
const access = vi.hoisted(() => ({ manage: true }));
vi.mock("@/lib/permissions/policy", () => ({
  canViewBilling: () => true,
  canManageBilling: () => access.manage,
}));
vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ actions }: { actions: ReactNode }) => createElement("div", null, actions),
}));
vi.mock("@/components/common/filter-form", () => ({
  FilterForm: ({ children }: { children: ReactNode }) => createElement("form", null, children),
}));
vi.mock("@/features/billing/components/payment-dialogs", () => ({
  RecordPaymentButton: () => createElement("button", null, "Record payment"),
}));
vi.mock("@/features/billing/queries/billing.queries", () => ({
  listOpenBills: async () => [],
  listPayments: async () => ({
    rows: [
      {
        id: "payment",
        dealId: "deal",
        dealCode: "DEAL-6FC1B03C",
        firstName: "John",
        lastName: "Dela Cruz",
        unitLabel: "Unit 1B · Tower 2 · Fairfield Heights + Unit 1A · Tower 2 · Fairfield Heights",
        brokerFirstName: "Broker",
        brokerLastName: "Test",
        paidOn: "2026-11-16",
        classification: "monthly",
        method: "bank_transfer",
        referenceNo: "INV-TEST-0001",
        amount: "10000",
      },
      {
        id: "missing-details",
        dealId: "other-deal",
        dealCode: "DEAL-OTHER",
        firstName: "Ana",
        lastName: "Santos",
        unitLabel: "Fairfield Heights",
        brokerFirstName: null,
        brokerLastName: null,
        paidOn: "2026-11-13",
        classification: "reservation",
        method: "cash",
        referenceNo: null,
        amount: "1500",
      },
    ],
    total: 2,
    summary: {
      collected: "11500",
      thisMonth: "11500",
      count: 2,
      thisMonthCount: 2,
      reservation: "1500",
      reservationCount: 1,
      monthly: "10000",
      monthlyCount: 1,
    },
  }),
}));

beforeEach(() => {
  access.manage = true;
});

async function render() {
  return renderToStaticMarkup(await PaymentsPage({ searchParams: Promise.resolve({}) }));
}

it("keeps payment details and bill links while separating each purchased unit", async () => {
  const html = await render();
  expect(html.match(/scope="col"/g)).toHaveLength(5);
  expect(html.match(/<li /g)).toHaveLength(3);
  for (const text of [
    "Unit 1B · Tower 2 · Fairfield Heights</li>",
    "Unit 1A · Tower 2 · Fairfield Heights</li>",
    'href="/billing/deal"',
    "DEAL-6FC1B03C",
    "Monthly",
    "Bank transfer",
    "Invoice no. INV-TEST-0001",
    "₱10,000.00",
    "Nov 16, 2026",
    "Broker Test",
    "No broker",
    "No invoice no.",
  ]) {
    expect(html).toContain(text);
  }
});

it("leads each summary with the amount, the number of payments underneath", async () => {
  const html = (await render()).replace(/<[^>]+>/g, " ");
  expect(html).toContain("Reservation");
  expect(html).toContain("₱1,500.00");
  expect(html).toContain("1 payment");
  expect(html).toContain("Date paid");
  expect(html).not.toContain("Paid on");
});

it("lets View billing read payments, with Record payment only for Manage", async () => {
  expect(await render()).toContain("Record payment");
  access.manage = false;
  const html = await render();
  expect(html).not.toContain("Record payment");
  expect(html).toContain("DEAL-6FC1B03C");
  expect(html).toContain("Export");
});
