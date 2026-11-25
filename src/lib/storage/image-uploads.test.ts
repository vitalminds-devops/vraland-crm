import { expect, it, vi } from "vitest";
import { checkImageUpload } from "./image-uploads";

it("rejects large images before trying to read their contents", async () => {
  const file = new File(["x"], "huge.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 });
  const read = vi.spyOn(file, "slice");
  expect(await checkImageUpload(file)).toMatchObject({
    ok: false,
    message: "Photos must be 5 MB or smaller.",
  });
  expect(read).not.toHaveBeenCalled();
});

it("returns a clear validation error if a selected image cannot be read", async () => {
  const file = new File(["x"], "photo.png", { type: "image/png" });
  vi.spyOn(file, "slice").mockImplementation(() => {
    throw new Error("file no longer available");
  });
  expect(await checkImageUpload(file)).toMatchObject({
    ok: false,
    message: expect.stringContaining("Couldn't read the photo"),
  });
});

it("accepts a matching image and explains a mismatched file", async () => {
  expect(
    await checkImageUpload(
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", { type: "image/jpeg" }),
    ),
  ).toMatchObject({ ok: true, extension: "jpg" });
  expect(
    await checkImageUpload(new File(["text"], "photo.jpg", { type: "image/jpeg" })),
  ).toMatchObject({ ok: false, message: expect.stringContaining("doesn't match its file type") });
});
