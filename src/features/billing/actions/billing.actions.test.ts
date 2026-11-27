import { beforeEach, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { InventoryUnavailable } from "@/features/deals/lib/deal-inventory";
import { syncBillingInventory } from "../lib/billing-inventory";
import { billItems, bills, dealStageChangeRequests, documents, payments } from "@/db/schema";
import { applyStageChange } from "@/features/deals/lib/apply-stage-change";
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
  held: null as string | null,
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
vi.mock("@/features/deals/lib/apply-stage-change", () => ({
  applyStageChange: vi.fn(async (): Promise<unknown> => ({ success: true, data: { id: "deal" } })),
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
      unitId: null,
      unitIds: ["0b6f1d4e-2c41-4a8e-9b11-5d3e2f7a9c10"],
      parkingSlotIds: [],
    };
  },
  inventoryHeldElsewhere: async () => mock.held,
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
  mock.held = null;
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
  method: "online",
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
        [{ paid: "0", reservationPaid: "100" }],
      ];
      result = await recordPayment(paymentInput, transactionSlip());
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
        [{ paid: "0", reservationPaid: "100" }],
      ];
      result = await recordPayment(paymentInput, transactionSlip());
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
  expect(await recordPayment(paymentInput, transactionSlip())).toMatchObject({
    success: false,
    error: { message: "This opportunity is lost or cancelled. Reopen it to record a payment." },
  });
  expect(mock.writes).toEqual([]);
  expect(syncBillingInventory).not.toHaveBeenCalled();
});

it.each(["save", "record"])(
  "refuses to %s billing while the deal is still in Leads",
  async (op) => {
    mock.slug = "leads";
    mock.reads = [[{ dealId: input.dealId }]];
    const result =
      op === "save" ? await saveBill(input) : await recordPayment(paymentInput, transactionSlip());
    expect(result).toMatchObject({
      success: false,
      error: { message: "Move this lead to Opportunity before billing it." },
    });
    expect(mock.writes).toEqual([]);
  },
);

it.each(["save", "record"])(
  "refuses to %s billing when another opportunity holds the unit",
  async (op) => {
    mock.held = "Unit 5A is already reserved by another opportunity. Pick again.";
    mock.reads = [[{ dealId: input.dealId }]];
    const result =
      op === "save" ? await saveBill(input) : await recordPayment(paymentInput, transactionSlip());
    expect(result).toMatchObject({ success: false, error: { message: mock.held } });
    expect(mock.writes).toEqual([]);
    expect(syncBillingInventory).not.toHaveBeenCalled();
  },
);

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
    // Before: fee paid, money held. After: fee no longer paid.
    [{ met: true }],
    [{ met: true }],
    [{ met: false }],
    [{ met: true }],
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
    // An older Won deal that never met its gates: nothing this void breaks.
    [{ met: false }],
    [{ met: false }],
    [{ met: false }],
    [{ met: false }],
    [{ met: false }],
    [{ met: false }],
  ];
  expect((await removePayment({ id: input.dealId })).success).toBe(true);
});

it("refuses to void the reservation payment of a Won deal", async () => {
  mock.won = true;
  mock.reads = [
    [{ billId: "bill", dealId: input.dealId }],
    [{ id: "bill" }],
    // Before: first month, reservation fee and money all there. After: the reservation is gone.
    [{ met: true }],
    [{ met: true }],
    [{ met: true }],
    [{ met: true }],
    [{ met: false }],
    [{ met: false }],
  ];
  expect((await removePayment({ id: input.dealId })).success).toBe(false);
  expect(mock.writes).toEqual([]);
});

it("refuses to void a Reservation deal's last reservation money, even below the fee", async () => {
  mock.slug = "reservation";
  mock.reads = [
    [{ billId: "bill", dealId: input.dealId }],
    [{ id: "bill" }],
    // The fee rose since, so the gate was already unmet; the money is still the last held.
    [{ met: false }],
    [{ met: true }],
    [{ met: false }],
    [{ met: false }],
  ];
  expect((await removePayment({ id: input.dealId })).success).toBe(false);
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
    [{ paid: "0", reservationPaid: "100" }],
    stages,
  ];
  expect(await recordPayment({ ...paymentInput, classification }, transactionSlip())).toMatchObject(
    {
      success: true,
      data: { message: `Payment recorded. Moved to ${name}.` },
    },
  );
  // The move runs under Billing's own context, not a second permission check.
  expect(applyStageChange).toHaveBeenCalledWith(expect.objectContaining({ userId: "manager" }), {
    dealId: input.dealId,
    stageId,
  });
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
  const result = await recordPayment(
    { ...paymentInput, amount, classification: "reservation" },
    transactionSlip(),
  );
  expect(result.success).toBe(ok);
  if (!ok)
    expect(result).toMatchObject({
      error: { message: "A reservation must be at least the ₱500.00 reservation fee." },
    });
});

it.each([
  [
    "no reservation yet",
    null,
    "0",
    300,
    "Pay the reservation fee before recording a monthly payment.",
  ],
  [
    "part of the fee",
    "500",
    "200",
    300,
    "Pay the reservation fee before recording a monthly payment.",
  ],
  [
    "below the amortization",
    "500",
    "500",
    299,
    "A monthly payment must be at least the ₱300.00 monthly amortization.",
  ],
  ["at the amortization", "500", "500", 300, null],
  ["no fee set, any reservation", null, "50", 300, null],
])("monthly payment with %s", async (_, reservationFee, reservationPaid, amount, error) => {
  mock.reads = [
    [{ dealId: input.dealId }],
    [{ id: "bill", dealId: input.dealId, total: "1000" }],
    [{ paid: reservationPaid, reservationFee, reservationPaid, monthlyAmount: "300" }],
    stages,
  ];
  const result = await recordPayment({ ...paymentInput, amount }, transactionSlip());
  if (error) {
    expect(result).toMatchObject({ success: false, error: { message: error } });
    expect(mock.writes).toEqual([]);
  } else expect(result.success).toBe(true);
});

const fullPayment = { ...paymentInput, amount: 1000, classification: "full_payment" };
const fullPaymentReads = () => [
  [{ dealId: input.dealId }],
  [{ id: "bill", dealId: input.dealId, total: "1000" }],
  [{ paid: "0", reservationPaid: "100" }],
  stages,
];

it("takes a full payment from Opportunity to Won, one stage at a time", async () => {
  mock.reads = fullPaymentReads();
  expect(await recordPayment(fullPayment, transactionSlip())).toMatchObject({
    data: { message: "Payment recorded. Moved to Won." },
  });
  expect(vi.mocked(applyStageChange).mock.calls).toEqual([
    [expect.anything(), { dealId: input.dealId, stageId: "reservation-stage" }],
    [expect.anything(), { dealId: input.dealId, stageId: "won-stage" }],
  ]);
});

it("stops a full payment's moves at a stage sent for approval", async () => {
  mock.reads = fullPaymentReads();
  vi.mocked(applyStageChange).mockResolvedValueOnce({
    success: true,
    data: { id: "deal", approvalRequested: true },
  });
  expect(await recordPayment(fullPayment, transactionSlip())).toMatchObject({
    data: { message: "Payment recorded. Sent to Reservation for approval." },
  });
  expect(applyStageChange).toHaveBeenCalledOnce();
});

it.each([
  [
    NO_RESERVATION_MESSAGE,
    { payment: "reservation" },
    "Payment recorded. Reservation fee not fully paid yet.",
  ],
  // Any wording works: the reason comes from the error's code, not its text.
  [
    "Reworded later.",
    { payment: "reservation" },
    "Payment recorded. Reservation fee not fully paid yet.",
  ],
  [NO_RESERVATION_MESSAGE, undefined, "Payment recorded. Not moved to Reservation."],
  ["Not allowed.", undefined, "Payment recorded. Not moved to Reservation."],
])("keeps the payment when the move is refused: %s", async (refusal, details, message) => {
  mock.reads = fullPaymentReads();
  vi.mocked(applyStageChange).mockResolvedValueOnce(failureFrom("INVALID_INPUT", refusal, details));
  expect(await recordPayment(fullPayment, transactionSlip())).toMatchObject({
    success: true,
    data: { message },
  });
  expect(applyStageChange).toHaveBeenCalledOnce();
});

it("reports the stage reached when a later move is refused", async () => {
  mock.reads = fullPaymentReads();
  vi.mocked(applyStageChange)
    .mockResolvedValueOnce({ success: true, data: { id: "deal" } })
    .mockResolvedValueOnce(
      failureFrom("INVALID_INPUT", NO_FIRST_MONTH_MESSAGE, { payment: "first-month" }),
    );
  expect(await recordPayment(fullPayment, transactionSlip())).toMatchObject({
    data: {
      message: "Payment recorded. Moved to Reservation. Monthly amortization not fully paid yet.",
    },
  });
});

it("leaves the stage alone when the payment does not match the deal's stage", async () => {
  mock.reads = [
    [{ dealId: input.dealId }],
    [{ id: "bill", dealId: input.dealId, total: "1000" }],
    [{ paid: "0", reservationPaid: "100" }],
    stages,
  ];
  expect(await recordPayment(paymentInput, transactionSlip())).toMatchObject({
    success: true,
    data: { message: "Payment recorded." },
  });
  expect(applyStageChange).not.toHaveBeenCalled();
});

it("refuses bills and payments on opportunities outside the user's data access", async () => {
  mock.inScope = false;
  expect(await saveBill(input)).toMatchObject({ success: false });
  mock.reads = [[{ dealId: input.dealId }]];
  expect(await recordPayment(paymentInput, transactionSlip())).toMatchObject({ success: false });
  mock.reads = [[{ billId: "bill", dealId: input.dealId }]];
  expect(await removePayment({ id: input.dealId })).toMatchObject({ success: false });
  expect(mock.writes).toEqual([]);
  expect(syncBillingInventory).not.toHaveBeenCalled();
});

const transactionSlip = () => new File(["%PDF-1.7\n"], "transfer.pdf", { type: "application/pdf" });

it.each(["online"])(
  "requires a transaction slip for %s before saving a payment",
  async (method) => {
    expect(await recordPayment({ ...paymentInput, method })).toMatchObject({
      success: false,
      error: { message: "Upload a transaction slip before recording the payment." },
    });
    expect(mock.transaction).not.toHaveBeenCalled();
    expect(mock.put).not.toHaveBeenCalled();
  },
);

it.each([
  "cash",
  "bank_financing",
  "pag_ibig",
  "in_house_financing",
  "other",
  "bank_transfer",
  "check",
])("records %s without a transaction slip", async (method) => {
  mock.reads = fullPaymentReads();
  expect((await recordPayment({ ...paymentInput, method })).success).toBe(true);
  expect(
    mock.writes.find((write) => write.table === payments)?.values.transactionSlipDocumentId,
  ).toBeNull();
  expect(mock.put).not.toHaveBeenCalled();
});

it("rejects an attachment for a payment method other than Online", async () => {
  expect(await recordPayment({ ...paymentInput, method: "cash" }, transactionSlip())).toMatchObject(
    {
      success: false,
      error: { message: "Transaction slips are only accepted for Online payments." },
    },
  );
  expect(mock.transaction).not.toHaveBeenCalled();
  expect(mock.put).not.toHaveBeenCalled();
});

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

it("cancels a move to Won waiting on the monthly payment just removed", async () => {
  mock.slug = "reservation";
  mock.reads = [
    [{ billId: "bill", dealId: input.dealId }],
    [{ id: "bill" }],
    // Reservation gates hold before and after: this was a monthly payment.
    [{ met: true }],
    [{ met: true }],
    [{ met: true }],
    [{ met: true }],
    // A move to Won waits for approval, and the first month is no longer paid.
    [{ id: "request", toWon: true, toSlug: "closed-won" }],
    [{ met: false }],
  ];
  expect((await removePayment({ id: input.dealId })).success).toBe(true);
  expect(mock.writes).toContainEqual({
    table: dealStageChangeRequests,
    values: expect.objectContaining({ status: "cancelled" }),
  });
});

it("keeps a line's unit only when the unit is this opportunity's", async () => {
  const own = "0b6f1d4e-2c41-4a8e-9b11-5d3e2f7a9c10";
  const other = "7d2a9e51-8c3b-4f60-a1d2-3e4b5c6d7e8f";
  const result = await saveBill({
    ...input,
    items: [
      { unitId: own, unitLabel: "1A", unitPrice: 1000, miscellaneousFee: 0 },
      { unitId: other, unitLabel: "9Z", unitPrice: 1000, miscellaneousFee: 0 },
    ],
  });
  expect(result.success).toBe(true);
  expect(mock.writes.find((write) => write.table === billItems)?.values).toMatchObject([
    { unitId: own, parkingSlotId: null },
    { unitId: null, parkingSlotId: null },
  ]);
});
