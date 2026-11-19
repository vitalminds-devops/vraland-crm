import { beforeEach, expect, it, vi } from "vitest";
import { notify } from "./toast";

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
);
vi.mock("sonner", () => ({ toast, Toaster: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it("keeps the reason visible for eight seconds and lets the user dismiss an error", () => {
  notify("Lead was not moved to Opportunity", "error", {
    description: "Enter the bank name in Details.",
  });
  expect(toast.error).toHaveBeenCalledWith("Lead was not moved to Opportunity", {
    description: "Enter the bank name in Details.",
    duration: 8000,
    closeButton: true,
  });
});

it("gives approval explanations time to be read", () => {
  notify("Move sent for approval", "success", {
    description: "The lead stays in Leads until a manager approves.",
  });
  expect(toast.success).toHaveBeenCalledWith(
    "Move sent for approval",
    expect.objectContaining({ duration: 6000 }),
  );
});

it.each(["saving-lead", 0])("preserves existing toast IDs (%s)", (id) => {
  notify("Saved", "success", id);
  expect(toast.success).toHaveBeenCalledWith(
    "Saved",
    expect.objectContaining({ id, duration: 2600 }),
  );
});

it("keeps the existing informational tone", () => {
  notify("Refreshing pipeline");
  expect(toast).toHaveBeenCalledWith(
    "Refreshing pipeline",
    expect.objectContaining({ duration: 2600 }),
  );
});
