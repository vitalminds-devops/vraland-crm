import { expect, it } from "vitest";
import { withoutEmptyFiles } from "./form-files";

it("drops an unused file input but keeps chosen files and other fields", () => {
  const form = new FormData();
  form.append("documents", new File([], ""));
  form.append("name", "Test");
  withoutEmptyFiles(form);
  expect(form.has("documents")).toBe(false);
  expect(form.get("name")).toBe("Test");

  const chosen = new File(["%PDF-1.7"], "id.pdf", { type: "application/pdf" });
  form.append("documents", chosen);
  form.append("documents", new File([], ""));
  withoutEmptyFiles(form);
  expect(form.getAll("documents")).toHaveLength(1);
  expect((form.get("documents") as File).name).toBe("id.pdf");
});
