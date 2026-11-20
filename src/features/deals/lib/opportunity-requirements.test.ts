import { expect, it, vi } from "vitest";
import { missingOpportunityDetails } from "./opportunity-requirements";

vi.mock("@/db", () => ({ db: {} }));

function transaction(tinNumber: string | null, overrides: Record<string, unknown> = {}) {
  const files = [{ documentType: "valid_id" }, { documentType: "client_appointment_form" }];
  const query = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([
      {
        amount: "100",
        developmentId: "development",
        buildingId: "building",
        unitId: "unit",
        contactId: "contact",
        financing: "cash",
        tinNumber,
        currentProvince: "Cebu",
        currentCity: "Cebu City",
        currentBarangay: "Lahug",
        budgetMin: null,
        budgetMax: "2299999",
        ...overrides,
      },
    ]),
  };
  const documentQuery = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(files),
  };
  return {
    select: vi.fn().mockReturnValueOnce(query).mockReturnValueOnce(documentQuery),
  } as unknown as Parameters<typeof missingOpportunityDetails>[0];
}

it.each([null, "", "   "])(
  "blocks a stage change without a TIN (%s), even with both documents",
  async (tin) => {
    expect(await missingOpportunityDetails(transaction(tin), "deal")).toBe(
      "Add the TIN number first.",
    );
  },
);

it("allows a stage change with a TIN and the other requirements", async () => {
  expect(await missingOpportunityDetails(transaction("123-456-789"), "deal")).toBeNull();
});

it("rejects a direct stage change that bypasses the Address step", async () => {
  expect(
    await missingOpportunityDetails(transaction("123-456-789", { currentCity: null }), "deal"),
  ).toBe("Add the address first.");
});
it("rejects a direct stage change that bypasses property interest", async () => {
  expect(
    await missingOpportunityDetails(transaction("123-456-789", { budgetMax: null }), "deal"),
  ).toBe("Add the budget range first.");
});
