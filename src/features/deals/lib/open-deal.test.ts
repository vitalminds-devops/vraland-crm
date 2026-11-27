import { expect, it, vi } from "vitest";
import { openDealForApprovedContact } from "./open-deal";

vi.mock("@/db", () => ({ db: {} }));

it("refuses a contact outside the caller's organization and writes nothing", async () => {
  // Reads in order: existing deal (none), first stage, the contact (not found in this organization).
  const reads = [[], [{ id: "stage", defaultProbability: 10 }], []];
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => reads.shift(),
  };
  const insert = vi.fn();
  const tx = { select: () => chain, insert } as unknown as Parameters<
    typeof openDealForApprovedContact
  >[0];

  const result = await openDealForApprovedContact(
    tx,
    { organizationId: "org", userId: "admin" } as Parameters<typeof openDealForApprovedContact>[1],
    { contactId: "foreign", contactName: "Ana", agentUserId: null },
  );
  expect(result.success).toBe(false);
  expect(insert).not.toHaveBeenCalled();
});
