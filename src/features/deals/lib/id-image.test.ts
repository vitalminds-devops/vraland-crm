import { expect, it } from "vitest";
import { idTextBounds } from "./id-image";

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
