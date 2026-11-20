import { expect, it } from "vitest";
import { blackAndWhite, idCardBounds, idTextBounds, localBlackAndWhite } from "./id-image";

function photo(rect?: { x: number; y: number; width: number; height: number }) {
  const data = new Uint8ClampedArray(100 * 150 * 4).fill(255);
  if (rect)
    for (let y = rect.y; y < rect.y + rect.height; y++)
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        const offset = (y * 100 + x) * 4;
        data[offset] = data[offset + 1] = data[offset + 2] = 50;
      }
  return data;
}
it("crops substantial blank margins with padding around dark content", () => {
  const bounds = idTextBounds(photo({ x: 15, y: 70, width: 70, height: 40 }), 100, 150)!;
  expect(bounds).toEqual({ x: 10, y: 65, width: 80, height: 50 });
});
it("does not crop blank images, isolated dust or full-frame content", () => {
  expect(idTextBounds(photo(), 100, 150)).toBeNull();
  expect(idTextBounds(photo({ x: 15, y: 70, width: 1, height: 1 }), 100, 150)).toBeNull();
  expect(idTextBounds(photo({ x: 0, y: 0, width: 100, height: 150 }), 100, 150)).toBeNull();
});
it("crops a light card lying on a dark table", () => {
  const data = new Uint8ClampedArray(100 * 150 * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    const x = (offset / 4) % 100;
    const y = Math.floor(offset / 4 / 100);
    const card = x >= 10 && x < 90 && y >= 50 && y < 100;
    data[offset] = data[offset + 1] = data[offset + 2] = card ? 210 : 70;
    data[offset + 3] = 255;
  }
  expect(idTextBounds(data, 100, 150)).toBeNull();
  expect(idCardBounds(data, 100, 150)).toEqual({ x: 5, y: 45, width: 90, height: 60 });
  expect(idCardBounds(new Uint8ClampedArray(100 * 150 * 4).fill(255), 100, 150)).toBeNull();
});
it("keeps dark text and drops light security print, following the photo's lighting", () => {
  const pixel = (value: number) => [value, value, value, 255];
  // 10% ink, 30% light pattern, 60% card, all photographed dim.
  const values = [...Array(10).fill(40), ...Array(30).fill(140), ...Array(60).fill(170)];
  const pixels = new Uint8ClampedArray(values.flatMap(pixel));
  blackAndWhite(pixels);
  expect(pixels[0]).toBe(0);
  expect(pixels[10 * 4]).toBe(255);
  expect(pixels[99 * 4]).toBe(255);
});
it("keeps text black on both sides of an unevenly lit photo", () => {
  // Bright on the left (220), dim on the right (90); text is 60 darker than its surroundings.
  const width = 200;
  const height = 60;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const card = 220 - (130 * x) / (width - 1);
      const text = y >= 25 && y < 35 && x % 10 < 4;
      const value = text ? card - 60 : card;
      const offset = (y * width + x) * 4;
      pixels.set([value, value, value, 255], offset);
    }
  const local = new Uint8ClampedArray(pixels);
  localBlackAndWhite(local, width, height);
  const at = (data: Uint8ClampedArray, x: number, y: number) => data[(y * width + x) * 4];
  // Text on the bright and the dim side is black; card on both sides is white.
  expect(at(local, 11, 30)).toBe(0);
  expect(at(local, 181, 30)).toBe(0);
  expect(at(local, 15, 5)).toBe(255);
  expect(at(local, 185, 5)).toBe(255);
  // One cut-off for the whole photo cannot do both: the dim side's card turns black.
  const global = new Uint8ClampedArray(pixels);
  blackAndWhite(global);
  expect(at(global, 185, 5) === 0 || at(global, 11, 30) === 255).toBe(true);
});
