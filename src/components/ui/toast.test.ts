import { beforeEach, expect, it, vi } from "vitest";
import { notify, notifyLoading } from "./toast";

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
  }),
);
vi.mock("sonner", () => ({ toast, Toaster: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it("keeps the reason visible for eight seconds and lets the user dismiss an error", () => {
  notify("Lead was not moved to Opportunity", "error", {
    description: "Enter the bank name in Details.",
  });
  expect(toast.error).toHaveBeenCalledWith(
    "Lead was not moved to Opportunity",
    expect.objectContaining({
      description: "Enter the bank name in Details.",
      duration: 8000,
      closeButton: true,
    }),
  );
});

it("gives approval explanations time to be read", () => {
  notify("Move sent for approval", "success", {
    description: "The lead stays in Leads until a manager approves.",
  });
  expect(toast.success).toHaveBeenCalledWith(
    "Move sent for approval",
    expect.objectContaining({ duration: 6000, closeButton: true }),
  );
});

it("supports warnings with a matching eight-second countdown", () => {
  notify("Check the required fields", "warning");
  expect(toast.warning).toHaveBeenCalledWith(
    "Check the required fields",
    expect.objectContaining({
      duration: 8000,
      closeButton: true,
      style: { "--toast-duration": "8000ms" },
    }),
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

it("replaces an upload's loading toast with a readable error using the same id", () => {
  toast.loading.mockReturnValueOnce("upload-document");
  const id = notifyLoading("Uploading document…");
  notify("Document not accepted", "error", { id, description: "Maximum file size is 15 MB." });
  expect(toast.loading).toHaveBeenCalledWith("Uploading document…");
  expect(toast.error).toHaveBeenCalledWith(
    "Document not accepted",
    expect.objectContaining({
      id: "upload-document",
      description: "Maximum file size is 15 MB.",
      duration: 8000,
      closeButton: true,
    }),
  );
});

it("reuses an operation id when submitting an upload again", () => {
  notifyLoading("Uploading document…", "upload-document");
  expect(toast.loading).toHaveBeenCalledWith("Uploading document…", { id: "upload-document" });
});
