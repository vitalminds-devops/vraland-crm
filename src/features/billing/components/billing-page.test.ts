import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import BillingPage from "../../../../app/(crm)/billing/page";

const fixture = vi.hoisted(() => ({
  canManage: true,
  rows: [
    { dealId: "new", billId: null, status: "unbilled", total: null, paid: "0" },
    { dealId: "unpaid", billId: "bill-unpaid", status: "unpaid", total: "1000", paid: "0" },
    { dealId: "partial", billId: "bill-partial", status: "partial", total: "1000", paid: "400" },
    { dealId: "paid", billId: "bill-paid", status: "paid", total: "1000", paid: "1000" },
  ],
}));
vi.mock("@/lib/permissions/authorization", () => ({ requirePagePermission: async () => ({}) }));
vi.mock("@/features/billing/queries/billing.queries", () => ({
  billStatuses: ["unbilled", "unpaid", "partial", "paid"],
  listBilling: async () => ({
    rows: fixture.rows.map((row) => ({
      ...row,
      title: row.dealId,
      dealCode: "DEAL",
      stageName: "Opportunity",
      contactId: null,
      brokerFirstName: "Broker",
      brokerLastName: "Name",
      unitLabel: "Unit 1A",
    })),
    total: 4,
    counts: { all: 10, unbilled: 1, unpaid: 2, partial: 3, paid: 4 },
    canManage: fixture.canManage,
    summary: { unbilled: 1, billed: 3, billedAmount: "3000", collected: "1400" },
  }),
}));
vi.mock("@/components/common/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/components/common/filter-form", () => ({
  FilterForm: ({ children }: { children: ReactNode }) => createElement("form", null, children),
}));
vi.mock("@/features/billing/components/payment-dialogs", () => ({
  RecordPaymentButton: ({ billId, balance }: { billId: string; balance: string }) =>
    createElement("button", { "data-bill": billId, "data-balance": balance }, "Record payment"),
}));
beforeEach(() => {
  fixture.canManage = true;
});

async function render(status?: string) {
  return renderToStaticMarkup(
    await BillingPage({ searchParams: Promise.resolve({ status, search: "Juan" }) }),
  );
}

it("uses one table with create, record-payment and view actions for each billing state", async () => {
  const html = await render();
  expect(html.match(/<table/g)).toHaveLength(1);
  expect(html).not.toContain("Bill a contact");
  expect(html).toContain("Create bill");
  expect(html).toContain('data-bill="bill-unpaid" data-balance="1000"');
  expect(html).toContain('data-bill="bill-partial" data-balance="600"');
  expect(html).not.toContain('data-bill="bill-paid"');
  expect(html.match(/>View bill</g)).toHaveLength(3);
});

it("keeps the selected status when searching and provides a filter for all bills", async () => {
  const html = await render("partial");
  expect(html).toContain('name="status" value="partial"');
  expect(html).toContain('href="/billing?search=Juan"');
  expect(html).toContain('aria-current="page"');
});

it("keeps the workspace read-only for bill viewers", async () => {
  fixture.canManage = false;
  const html = await render();
  expect(html).not.toContain("Create bill");
  expect(html).not.toContain("Record payment");
  expect(html.match(/>View bill</g)).toHaveLength(4);
});

it("shows status counts and column headings without the redundant card header", async () => {
  const html = await render("partial");
  const tabs = html.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
  for (const [label, count] of [
    ["All bills", 10],
    ["Not billed", 1],
    ["Billed · unpaid", 2],
    ["Partially paid", 3],
    ["Fully paid", 4],
  ]) {
    expect(tabs).toMatch(new RegExp(`${label}<span[^>]*>${count}</span>`));
  }
  expect(html).not.toMatch(/<thead class="[^"]*\bsr-only\b[^"]*">/);
  expect(html).toContain(">Contact</th>");
  expect(html).not.toContain("Clients &amp; bills");
  expect(html).not.toContain("Unbilled and unpaid opportunities appear first.");
});
