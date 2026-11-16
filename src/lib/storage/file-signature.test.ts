import { describe, expect, it } from "vitest";

import { matchesDeclaredType, matchesSignature } from "./file-signature";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

describe("matchesSignature", () => {
  it("accepts files whose bytes match the declared type", () => {
    expect(matchesSignature("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(
      matchesSignature("image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe(true);
    expect(matchesSignature("image/webp", text("RIFF\0\0\0\0WEBPVP8 "))).toBe(true);
    expect(matchesSignature("application/pdf", text("%PDF-1.7"))).toBe(true);
    expect(matchesSignature("text/plain", text("hello"))).toBe(true);
  });

  it("rejects mislabelled or unknown files", () => {
    expect(matchesSignature("image/png", text("<svg onload=alert(1)>"))).toBe(false);
    expect(matchesSignature("application/pdf", bytes(0xff, 0xd8, 0xff))).toBe(false);
    expect(matchesSignature("text/plain", bytes(0x4d, 0x5a, 0x00, 0x90))).toBe(false);
    expect(matchesSignature("image/svg+xml", text("<svg/>"))).toBe(false);
  });

  it("reads the head of a File", async () => {
    const file = new File([text("%PDF-1.4 body")], "a.pdf", { type: "application/pdf" });
    expect(await matchesDeclaredType(file)).toBe(true);
  });
});
