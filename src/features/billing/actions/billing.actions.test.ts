import { beforeEach, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { InventoryUnavailable } from "@/features/deals/lib/deal-inventory";
import { syncBillingInventory } from "../lib/billing-inventory";
import { bills, documents, payments } from "@/db/schema";
import { changeDealStage } from "@/features/deals/actions/deal.actions";
import {
  NO_FIRST_MONTH_MESSAGE,
  NO_RESERVATION_MESSAGE,
} from "@/features/deals/lib/stage-transitions";
import { failureFrom } from "@/lib/types/action-result";
import { recordPayment, removePayment, saveBill } from "./billing.actions";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  canManage: true,
  reads: [] as unknown[][],
  locks: [] as string[],
  unavailable: false,
  closed: false,
  won: false,
  slug: "opportunity",
  inScope: true,
  writes: [] as { table: unknown; values: Record<string, unknown> }[],
  put: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/storage/document-storage", () => ({
  getDocumentStorage: () => ({ put: mock.put, remove: mock.remove }),
}));
vi.mock("@/db", () => ({ db: { transaction: mock.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({
  canAccessResource: async () => mock.inScope,
  requireAuthorizationContext: async () => ({
    organizationId: "organization",
    userId: "manager",
    permissions: new Set(["deals.change_stage"]),
  }),
}));
vi.mock("@/features/deals/actions/deal.actions", () => ({
  changeDealStage: vi.fn(async (): Promise<unknown> => ({ success: true, data: { id: "deal" } })),
}));
vi.mock("@/lib/permissions/policy", () => ({ canManageBilling: () => mock.canManage }));

vi.mock("../lib/billing-inventory", () => ({
  lockDealForInventory: async () => {
    mock.locks.push("deal");
    return {
      id: "88f50ab3-567a-4a37-9271-eaa92a221995",
      brokerUserId: "broker",
      isLostStage: mock.closed,
      isCancelledStage: false,
      isWonStage: mock.won,
      slug: mock.slug,
    };
  },
  syncBillingInventory: vi.fn(async () => {
    mock.locks.push("inventory");
    if (mock.unavailable) throw new InventoryUnavailable("Selected unit is no longer available.");
    return ["property"];
  }),
}));

const input = {
  dealId: "88f50ab3-567a-4a37-9271-eaa92a221995",
  items: [{ unitLabel: "1A", unitPrice: 1000, miscellaneousFee: 0 }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.put.mockResolvedValue(undefined);
  mock.remove.mockResolvedValue(undefined);
  mock.canManage = true;
  mock.writes = [];
  mock.unavailable = false;
  mock.closed = false;
  mock.won = false;
  mock.slug = "opportunity";
  mock.inScope = true;
  mock.locks = [];
  mock.reads = [[{ id: "bill", reservationDiscount: "0" }], [{ paid: "0" }]];
  mock.transaction.mockImplementation(async (work) => {
    function query(rows: unknown[]) {
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        for: () => {
          mock.locks.push("bill");
          return chain;
        },
        returning: async () => [{ id: "bill", billId: "bill", amount: "100" }],
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return chain;
    }
    try {
      return await work({
        select: () => query(mock.reads.shift() ?? []),
        update: (table: unknown) => ({
          set: (values: Record<string, unknown>) => {
            mock.writes.push({ table, values });
            return query([]);
          },
        }),
        delete: () => query([]),
        insert: (table: unknown) => ({
          values: (values: Record<string, unknown>) => {
            mock.writes.push({ table, values });
            return query([]);
          },
        }),
      });
    } catch (error) {
      mock.writes = [];
      throw error;
    }
  });
});

it("saves validated applicant details on the bill without editing the contact", async () => {
  const result = await saveBill({
    ...input,
    applicantDetails: { firstName: " Ana ", emailAddress: "ana@example.com" },
  });
  expect(result.success).toBe(true);
  expect(mock.writes.find((write) => write.table === bills)?.values.applicantDetails).toMatchObject(
    { firstName: "Ana", emailAddress: "ana@example.com" },
  );
});

it("preserves saved applicant details when an older caller omits them", async () => {
  expect((await saveBill(input)).success).toBe(true);
  expect(mock.writes.find((write) => write.table === bills)?.values).not.toHaveProperty(
    "applicantDetails",
  );
});

it("rejects invalid applicant data before writing", async () => {
  expect(
    (await saveBill({ ...input, applicantDetails: { emailAddress: "invalid" } })).success,
  ).toBe(false);
  expect(mock.transaction).not.toHaveBeenCalled();
});

it("keeps bill editing restricted to billing managers", async () => {
  mock.canManage = false;
  expect((await saveBill({ ...input, applicantDetails: { firstName: "Ana" } })).success).toBe(
    false,
  );
  expect(mock.transaction).not.toHaveBeenCalled();
});

it("rejects a bill whose discount brings the total to ₱0", async () => {
  const result = await saveBill({ ...input, reservationDiscount: 1000 });
  expect(result).toMatchObject({
    success: false,
    error: { message: "The bill total must be more than ₱0." },
  });
  expect(mock.writes).toEqual([]);
});

const paymentInput = {
  billId: input.dealId,
  amount: 100,
  paidOn: "2026-11-09",
  method: "cash",
  classification: "monthly",
};

it.each(["save", "record", "remove"])(
  "synchronizes inventory inside the %s transaction after locking deal and bill",
  async (operation) => {
    let result;
    if (operation === "save") result = await saveBill(input);
    else if (operation === "record") {
      mock.reads = [
        [{ dealId: input.dealId }],
        [{ id: "bill", dealId: input.dealId, total: "1000" }],
        [{ paid: "0" }],
      ];
      result = await recordPayment(paymentInput);
    } else {
      mock.reads = [[{ billId: "bill", dealId: input.dealId }], [{ id: "bill" }]];
      result = await removePayment({ id: input.dealId });
    }
    expect(result.success).toBe(true);
    expect(mock.locks).toEqual(["deal", "bill", "inventory"]);
    expect(syncBillingInventory).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith("/properties/property");
    expect(revalidatePath).toHaveBeenCalledWith("/developments", "layout");
  },
);

it.each(["save", "record", "remove"])(
  "rolls back %s when selected inventory belongs to another deal",
  async (operation) => {
    mock.unavailable = true;
    let result;
    if (operation === "save") result = await saveBill(input);
    else if (operation === "record") {
      mock.reads = [
        [{ dealId: input.dealId }],
        [{ id: "bill", dealId: input.dealId, total: "1000" }],
        [{ paid: "0" }],
      ];
      result = await recordPayment(paymentInput);
    } else {
      mock.reads = [[{ billId: "bill", dealId: input.dealId }], [{ id: "bill" }]];
      result = await removePayment({ id: input.dealId });
    }
    expect(result).toMatchObject({
      success: false,
      error: { message: "Selected unit is no longer available." },
    });
    expect(mock.writes).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  },
);

it("refuses a payment on a lost deal", async () => {
  mock.closed = true;
  mock.reads = [[{ dealId: input.dealId }]];
  expect(await recordPayment(paymentInput)).toMatchObject({
    success: false,
    error: { message: "This opportunity is lost or cancelled. Reopen it to record a payment." },
  });
  expect(mock.writes).toEqual([]);
  expect(syncBillingInventory).not.toHaveBeenCalled();
});

it("refuses a price change on a won deal, whose commissions are set", async () => {
  mock.won = true;
  mock.reads = [[{ id: "bill", unitPrice: "900", reservationDiscount: "0" }]];
  expect(await saveBill(input)).toMatchObject({
    success: false,
    error: {
      message:
        "This opportunity is won and its commissions are set. Reopen it to change the price.",
    },
  });
  expect(mock.writes).toEqual([]);
});

it("refuses to void the payment a Reservation deal stands on", async () => {
  mock.slug = "reservation";
  mock.reads = [
    [{ billId: "bill", dealId: input.dealId }],
    [{ id: "bill" }],
    [{ paid: true }],
    [{ paid: false }],
  ];
  expect(await removePayment({ id: input.dealId })).toMatchObject({
    success: false,
    error: {
      message: "The opportunity's stage depends on this payment. Move it back a stage first.",
    },
  });
  expect(mock.writes).toEqual([]);
});

it("voids a payment when the stage's gate was already unmet", async () => {
  mock.won = true;
  mock.reads = [
    [{ billId: "bill", dealId: input.dealId }],
    [{ id: "bill" }],
    [{ paid: false }],
    [{ paid: false }],
  ];
  expect((await removePayment({ id: input.dealId })).success).toBe(true);
});

const stages = [
  { id: "opportunity-stage", name: "Opportunity", slug: "opportunity", isWonStage: false },
  { id: "reservation-stage", name: "Reservation", slug: "reservation", isWonStage: false },
  { id: "won-stage", name: "Won", slug: "won", isWonStage: true },
];

it.each([
  ["reservation", "opportunity", "reservation-stage", "Reservation"],
  ["monthly", "reservation", "won-stage", "Won"],
])("moves the deal after a %s payment from %s", async (classification, slug, stageId, name) => {
  mock.slug = slug;
  mock.reads = [
    [{ dealId: input.dealId }],
    [{ id: "bill", dealId: input.dealId, total: "1000" }],
    [{ paid: "0" }],
    stages,
  ];
  expect(await recordPayment({ ...paymentInput, classification })).toMatchObject({
    success: true,
    data: { message: `Payment recorded. Moved to ${name}.` },
  });
  expect(changeDealStage).toHaveBeenCalledWith({ dealId: input.dealId, stageId });
});

it.each([
  [400, "0", false],
  [500, "0", true],
  [600, "0", true],
  [300, "200", true],
])("needs a ₱%s reservation to cover the fee (₱%s already paid)", async (amount, prior, ok) => {
  mock.reads = [
    [{ dealId: input.dealId }],
    [{ id: "bill", dealId: input.dealId, total: "1000" }],
    [{ paid: prior, reservationFee: "500", reservationPaid: prior }],
    stages,
  ];
  const result = await recordPayment({ ...paymentInput, amount, classification: "reservation" });
  expect(result.success).toBe(ok);
  if (!ok)
    expect(result).toMatchObject({
      error: { message: "A reservation must be at least the ₱500.00 reservation fee." },
    });
});

const fullPayment = { ...paymentInput, amount: 1000, classification: "full_payment" };
const fullPaymentReads = () => [
  [{ dealId: input.dealId }],
  [{ id: "bill", dealId: input.dealId, total: "1000" }],
  [{ paid: "0" }],
  stages,
];

it("takes a full payment from Opportunity to Won, one stage at a time", async () => {
  mock.reads = fullPaymentReads();
  expect(await recordPayment(fullPayment)).toMatchObject({
    data: { message: "Payment recorded. Moved to Won." },
  });
  expect(vi.mocked(changeDealStage).mock.calls).toEqual([
    [{ dealId: input.dealId, stageId: "reservation-stage" }],
    [{ dealId: input.dealId, stageId: "won-stage" }],
  ]);
});

it("stops a full payment's moves at a stage sent for approval", async () => {
  mock.reads = fullPaymentReads();
  vi.mocked(changeDealStage).mockResolvedValueOnce({
    success: true,
    data: { id: "deal", approvalRequested: true },
  });
  expect(await recordPayment(fullPayment)).toMatchObject({
    data: { message: "Payment recorded. Sent to Reservation for approval." },
  });
  expect(changeDealStage).toHaveBeenCalledOnce();
});

it.each([
  [NO_RESERVATION_MESSAGE, "Payment recorded. Reservation fee not fully paid yet."],
  ["Not allowed.", "Payment recorded. Not moved to Reservation."],
])("keeps the payment when the move is refused: %s", async (refusal, message) => {
  mock.reads = fullPaymentReads();
  vi.mocked(changeDealStage).mockResolvedValueOnce(failureFrom("INVALID_INPUT", refusal));
  expect(await recordPayment(fullPayment)).toMatchObject({ success: true, data: { message } });
  expect(changeDealStage).toHaveBeenCalledOnce();
});

it("reports the stage reached when a later move is refused", async () => {
  mock.reads = fullPaymentReads();
  vi.mocked(changeDealStage)
    .mockResolvedValueOnce({ success: true, data: { id: "deal" } })
    .mockResolvedValueOnce(failureFrom("INVALID_INPUT", NO_FIRST_MONTH_MESSAGE));
  expect(await recordPayment(fullPayment)).toMatchObject({
    data: {
      message: "Payment recorded. Moved to Reservation. Monthly amortization not fully paid yet.",
    },
  });
});

it("leaves the stage alone when the payment does not match the deal's stage", async () => {
  mock.reads = [
    [{ dealId: input.dealId }],
    [{ id: "bill", dealId: input.dealId, total: "1000" }],
    [{ paid: "0" }],
    stages,
  ];
  expect(await recordPayment(paymentInput)).toMatchObject({
    success: true,
    data: { message: "Payment recorded." },
  });
  expect(changeDealStage).not.toHaveBeenCalled();
});

it("refuses bills and payments on opportunities outside the user's data access", async () => {
  mock.inScope = false;
  expect(await saveBill(input)).toMatchObject({ success: false });
  mock.reads = [[{ dealId: input.dealId }]];
  expect(await recordPayment(paymentInput)).toMatchObject({ success: false });
  mock.reads = [[{ billId: "bill", dealId: input.dealId }]];
  expect(await removePayment({ id: input.dealId })).toMatchObject({ success: false });
  expect(mock.writes).toEqual([]);
  expect(syncBillingInventory).not.toHaveBeenCalled();
});

const transactionSlip = () => new File(["%PDF-1.7\n"], "transfer.pdf", { type: "application/pdf" });

it("stores the transaction slip and links it to the payment in the same transaction", async () => {
  mock.reads = fullPaymentReads();
  expect((await recordPayment(paymentInput, transactionSlip())).success).toBe(true);
  const document = mock.writes.find((write) => write.table === documents)?.values;
  const payment = mock.writes.find((write) => write.table === payments)?.values;
  expect(document).toMatchObject({
    dealId: input.dealId,
    documentType: "transaction_slip",
    isSensitive: true,
    mimeType: "application/pdf",
  });
  expect(payment?.transactionSlipDocumentId).toBe(document?.id);
  expect(mock.put).toHaveBeenCalledWith(document?.storageKey, expect.any(Buffer));
  expect(mock.remove).not.toHaveBeenCalled();
});

it("rejects an invalid slip before saving money or uploading anything", async () => {
  const result = await recordPayment(
    paymentInput,
    new File(["not PDF"], "bad.pdf", { type: "application/pdf" }),
  );
  expect(result).toMatchObject({
    success: false,
    error: { message: expect.stringContaining("contents do not match") },
  });
  expect(mock.transaction).not.toHaveBeenCalled();
  expect(mock.put).not.toHaveBeenCalled();
});

it("removes the uploaded slip when the payment transaction rolls back", async () => {
  mock.reads = fullPaymentReads();
  mock.unavailable = true;
  expect((await recordPayment(paymentInput, transactionSlip())).success).toBe(false);
  expect(mock.writes).toEqual([]);
  expect(mock.remove).toHaveBeenCalledWith(mock.put.mock.calls[0][0]);
});

it("does not record a payment when its slip cannot be stored", async () => {
  mock.reads = fullPaymentReads();
  mock.put.mockRejectedValueOnce(new Error("disk unavailable"));
  expect((await recordPayment(paymentInput, transactionSlip())).success).toBe(false);
  expect(mock.writes).toEqual([]);
});

it("keeps the saved payment and slip if refreshing the page fails after commit", async () => {
  mock.reads = fullPaymentReads();
  vi.mocked(revalidatePath).mockImplementationOnce(() => {
    throw new Error("refresh failed");
  });
  expect(await recordPayment(paymentInput, transactionSlip())).toMatchObject({
    success: true,
    data: { message: expect.stringContaining("Payment recorded.") },
  });
  expect(mock.writes.some((write) => write.table === payments)).toBe(true);
  expect(mock.remove).not.toHaveBeenCalled();
});
