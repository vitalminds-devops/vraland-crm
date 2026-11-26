import { expect, it, vi } from "vitest";
import { documentFileError, requirementFileTypes } from "./document-validation";

it("names oversized and empty files and explains how to fix them", async () => {
  const file = new File(["%PDF-1.7"], "large.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: 16 * 1024 * 1024 });
  expect(await documentFileError(file)).toContain("large.pdf is 16.0 MB. The maximum is 15 MB");
  expect(await documentFileError(new File([], "empty.pdf"))).toContain("empty.pdf is empty");
});

it("distinguishes an unsupported format from mismatched file contents", async () => {
  expect(
    await documentFileError(new File(["data"], "sheet.xlsx", { type: "application/vnd.ms-excel" })),
  ).toContain("sheet.xlsx has an unsupported file type. Accepted formats:");
  expect(
    await documentFileError(new File(["not a PDF"], "id.pdf", { type: "application/pdf" })),
  ).toContain("id.pdf: the file contents do not match its declared type");
});

it("keeps the narrower checklist rules and accepts supported file signatures", async () => {
  const word = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "file.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  expect(await documentFileError(word)).toBeNull();
  expect(await documentFileError(word, requirementFileTypes)).toContain(
    "Accepted formats: PDF, JPG, PNG",
  );
  expect(
    await documentFileError(new File(["%PDF-1.7"], "id.pdf", { type: "application/pdf" })),
  ).toBeNull();
  expect(
    await documentFileError(new File(["hello"], "notes.txt", { type: "text/plain" })),
  ).toBeNull();
});

it("accepts exactly 15 MB and explains a file read failure", async () => {
  const file = new File(["%PDF-1.7"], "id.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: 15 * 1024 * 1024 });
  expect(await documentFileError(file)).toBeNull();
  vi.spyOn(file, "slice").mockImplementation(() => {
    throw new Error("unreadable");
  });
  expect(await documentFileError(file)).toContain("Couldn't read id.pdf");
});
