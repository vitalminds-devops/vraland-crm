import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import DealBillingPage from "../../../../app/(crm)/billing/[dealId]/page";
import { billApplicantSchema } from "../schemas/bill-applicant.schema";

const fixture = vi.hoisted(() => ({ saved: false, canManage: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/permissions/authorization", () => ({ getAuthorizationContext: async () => ({}) }));
vi.mock("@/lib/permissions/policy", () => ({ canViewBilling: () => true }));
vi.mock("@/features/billing/actions/billing.actions", () => ({ saveBill: vi.fn() }));
vi.mock("@/components/common/back-button", () => ({
  BackButton: () => createElement("a", { href: "/billing" }, "Back to billing"),
}));
vi.mock("@/features/billing/components/payment-dialogs", () => ({
  Modal: () => null,
  RecordPaymentButton: () => createElement("button", null, "Record payment"),
  RemovePaymentButton: () => createElement("button", null, "Remove payment"),
}));
vi.mock("@/features/billing/queries/billing.queries", () => ({
  getDealBilling: async () => ({
    dealId: "deal",
    dealCode: "DEAL-422BF615",
    title: "John Doe opportunity",
    stageName: "Opportunity",
    dealStatus: "open",
    brokerFirstName: "John",
    brokerLastName: "Doe",
    developmentName: "Fairfield Heights",
    floorAreaSqm: "0",
    reservationFee: "10655",
    parkingAmount: "0",
    monthlyAmortization: "15660655",
    reservationDiscount: "0",
    notes: null,
    paid: fixture.saved ? "1250000" : "0",
    total: fixture.saved ? "10000000" : null,
    status: fixture.saved ? "partial" : "unbilled",
    billId: fixture.saved ? "bill" : null,
    canManage: fixture.canManage,
    lines: ["2A", "2C", "2B", "2D", "2E"].map((unit) => ({
      unitLabel: `Unit ${unit} · Tower 1 · Fairfield Heights`,
      unitPrice: "2000000",
      miscellaneousFee: "0",
    })),
    applicantAsOf: "2026-11-18",
    applicantDetails: billApplicantSchema.parse({
      lastName: "DOE",
      firstName: "JOHN",
      completeAddress: "Liboron, Catigbian, Bohol, 6343, Philippines",
    }),
    payments: fixture.saved
      ? [
          {
            id: "payment",
            amount: "1250000",
            classification: "reservation",
            method: "bank_transfer",
            referenceNo: "INV-2026-001",
            paidOn: "2026-11-17",
            notes: null,
          },
        ]
      : [],
  }),
}));
beforeEach(() => {
  fixture.saved = false;
  fixture.canManage = true;
});
async function render() {
  return renderToStaticMarkup(
    await DealBillingPage({ params: Promise.resolve({ dealId: "deal" }) }),
  );
}

it("puts per-unit prices and fees before expandable applicant details on bill creation", async () => {
  const html = await render();
  expect(html.indexOf("Bill items")).toBeLessThan(html.indexOf("Review applicant details"));
  expect(html.match(/Miscellaneous fee \(₱\)/g)).toHaveLength(5);
  expect(html).toContain("Quoted prices and fees");
  expect(html).not.toContain("Parking fee");
  expect(html).toContain("Monthly amortization");
  expect(html).toContain("Payments can be recorded after the bill is saved.");
  expect(html).toContain('value="DOE"');
  expect(html).toMatch(/<details[^>]*><summary/);
  expect(html).not.toMatch(/<details[^>]*\bopen/);
  expect(html).toContain("Save bill");
  expect(html).not.toContain("Print bill");
  expect(html).not.toContain("Total net selling price");
});

it("shows saved totals, payment history and edit controls without a create form", async () => {
  fixture.saved = true;
  const html = await render();
  for (const text of [
    "Bill summary",
    "Print bill",
    "VRA Land Inc.",
    "Billing statement",
    "Payment history",
    "Remaining balance",
    "₱8,750,000.00",
    "Edit bill",
    "Record payment",
    "Invoice no. INV-2026-001",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain("Create bill");
  expect(html).not.toContain("Save bill");
  expect(html).toContain('alt="VRA Land logo"');
  expect(html).toContain('src="/images/vra_logo.png"');
  expect(html).toContain('aria-label="Printable billing statement"');
});

it("lets billing viewers print the branded statement without editing controls", async () => {
  fixture.saved = true;
  fixture.canManage = false;
  const html = await render();
  expect(html).toContain("Print bill");
  expect(html).toContain("Billing statement");
  expect(html).toContain("INV-2026-001");
  expect(html).not.toContain("Edit bill");
  expect(html).not.toContain("Record payment");
});

it("keeps bill creation hidden from viewers", async () => {
  fixture.canManage = false;
  const html = await render();
  expect(html).toContain("No bill has been created for this opportunity.");
  expect(html).not.toContain("Save bill");
  expect(html).not.toContain("Create bill");
});
