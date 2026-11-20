import { expect, it } from "vitest";
import {
  findDocumentQuad,
  flatSize,
  orderCorners,
  warpDocument,
  type Point,
} from "./document-scan";

const inside = (point: Point, quad: Point[]) =>
  quad.every((corner, index) => {
    const next = quad[(index + 1) % quad.length];
    return (
      (next.x - corner.x) * (point.y - corner.y) - (next.y - corner.y) * (point.x - corner.x) >= 0
    );
  });

/** A photo with `card` coloured inside `quad`, a few dark "text" marks, on a `table` colour. */
function photo(width: number, height: number, quad: Point[], card: number[], table: number[]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const onCard = inside({ x, y }, quad);
      const text = onCard && y % 14 < 3 && x % 9 < 6;
      const colour = text ? [30, 30, 30] : onCard ? card : table;
      // A little grain so the table is not perfectly flat.
      const grain = ((x * 7 + y * 13) % 11) - 5;
      pixels[offset] = colour[0] + grain;
      pixels[offset + 1] = colour[1] + grain;
      pixels[offset + 2] = colour[2] + grain;
      pixels[offset + 3] = 255;
    }
  return pixels;
}

const near = (found: Point[] | null, expected: Point[], tolerance = 5) => {
  expect(found).not.toBeNull();
  found!.forEach((corner, index) => {
    expect(Math.abs(corner.x - expected[index].x)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(corner.y - expected[index].y)).toBeLessThanOrEqual(tolerance);
  });
};

it("finds a tilted, perspective-skewed ID on a dark table", () => {
  // Clockwise from top-left, as a phone held at an angle sees it.
  const quad = [
    { x: 70, y: 60 },
    { x: 330, y: 85 },
    { x: 315, y: 245 },
    { x: 60, y: 215 },
  ];
  near(findDocumentQuad(photo(400, 300, quad, [205, 225, 235], [90, 70, 55]), 400, 300), quad);
});

it("finds a pale card on paper of a different colour", () => {
  const quad = [
    { x: 120, y: 160 },
    { x: 290, y: 150 },
    { x: 300, y: 260 },
    { x: 125, y: 270 },
  ];
  near(findDocumentQuad(photo(400, 400, quad, [200, 215, 235], [225, 205, 150]), 400, 400), quad);
});

it("finds nothing on an empty table or when the card already fills the photo", () => {
  const empty = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  expect(findDocumentQuad(photo(300, 200, empty, [0, 0, 0], [90, 70, 55]), 300, 200)).toBeNull();
  const full = [
    { x: 0, y: 0 },
    { x: 299, y: 0 },
    { x: 299, y: 199 },
    { x: 0, y: 199 },
  ];
  expect(
    findDocumentQuad(photo(300, 200, full, [205, 225, 235], [90, 70, 55]), 300, 200),
  ).toBeNull();
});

it("puts corners in reading order whatever order they come in", () => {
  expect(
    orderCorners([
      { x: 90, y: 80 },
      { x: 10, y: 5 },
      { x: 5, y: 70 },
      { x: 95, y: 10 },
    ]),
  ).toEqual([
    { x: 10, y: 5 },
    { x: 95, y: 10 },
    { x: 90, y: 80 },
    { x: 5, y: 70 },
  ]);
});

it("flattens a skewed card into a straight rectangle", () => {
  const quad = [
    { x: 70, y: 60 },
    { x: 330, y: 85 },
    { x: 315, y: 245 },
    { x: 60, y: 215 },
  ];
  const source = photo(400, 300, quad, [205, 225, 235], [90, 70, 55]);
  const size = flatSize(quad, 400);
  expect(size.width / size.height).toBeGreaterThan(1.4);
  const flat = warpDocument(source, 400, 300, quad, size.width, size.height)!;
  // Every corner of the output is card, not table.
  for (const [u, v] of [
    [3, 3],
    [size.width - 4, 3],
    [size.width - 4, size.height - 4],
    [3, size.height - 4],
  ]) {
    const offset = (v * size.width + u) * 4;
    expect(flat[offset + 2]).toBeGreaterThan(180);
  }
});
