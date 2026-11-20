/**
 * Document-camera scanning without OpenCV: find a card's four corners in a photo and warp it
 * flat, like a phone camera's document mode. Works on RGBA pixels, so it runs in the browser
 * and in tests alike. Detection expects a small image (about 400 px across).
 */
export type Point = { x: number; y: number };

const cross = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const triangle = (a: Point, b: Point, c: Point) => Math.abs(cross(a, b, c)) / 2;
const polygonArea = (points: Point[]) =>
  Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0),
  ) / 2;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Otsu's threshold over values 0..255. */
function otsu(histogram: Uint32Array, total: number) {
  let sum = 0;
  for (let value = 0; value < 256; value++) sum += value * histogram[value];
  let below = 0;
  let belowSum = 0;
  let best = 0;
  let threshold = 0;
  for (let value = 0; value < 256; value++) {
    below += histogram[value];
    if (!below) continue;
    const above = total - below;
    if (!above) break;
    belowSum += value * histogram[value];
    const between = below * above * (belowSum / below - (sum - belowSum) / above) ** 2;
    if (between > best) {
      best = between;
      threshold = value;
    }
  }
  return threshold;
}

/** Pixels that differ from the background, which is sampled from the photo's outer edge. */
function foregroundMask(pixels: Uint8ClampedArray, width: number, height: number) {
  const ring = Math.max(2, Math.round(Math.min(width, height) * 0.04));
  const samples: number[][] = [[], [], []];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (x >= ring && x < width - ring && y >= ring && y < height - ring) continue;
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) samples[channel].push(pixels[offset + channel]);
    }
  const background = samples.map((values) => values.sort((a, b) => a - b)[values.length >> 1]);
  const distances = new Uint8Array(width * height);
  const histogram = new Uint32Array(256);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    const value = Math.min(
      255,
      Math.round(
        Math.hypot(
          pixels[offset] - background[0],
          pixels[offset + 1] - background[1],
          pixels[offset + 2] - background[2],
        ),
      ),
    );
    distances[index] = value;
    histogram[value]++;
  }
  // A floor keeps sensor noise on a plain table from becoming "foreground".
  const threshold = Math.max(24, otsu(histogram, width * height));
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index++)
    mask[index] = distances[index] > threshold ? 1 : 0;
  return mask;
}

/** 3×3 erosion or dilation, to drop specks (open) and close gaps from glare or print (close). */
function morph(mask: Uint8Array, width: number, height: number, dilate: boolean) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let hit = !dilate;
      for (let dy = -1; dy <= 1 && hit !== dilate; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const value = nx >= 0 && ny >= 0 && nx < width && ny < height ? mask[ny * width + nx] : 0;
          if (dilate ? value : !value) {
            hit = dilate;
            break;
          }
        }
      out[y * width + x] = hit ? 1 : 0;
    }
  return out;
}

/** The largest connected region of the mask, as its pixels' coordinates. */
function largestRegion(mask: Uint8Array, width: number) {
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let best: Point[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const region: Point[] = [];
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = (index - x) / width;
      region.push({ x, y });
      for (const next of [index - 1, index + 1, index - width, index + width]) {
        if (next < 0 || next >= mask.length || seen[next] || !mask[next]) continue;
        if ((next === index - 1 && x === 0) || (next === index + 1 && x === width - 1)) continue;
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
    if (region.length > best.length) best = region;
  }
  return best;
}

/** Convex hull by Andrew's monotone chain. */
function convexHull(points: Point[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0)
      lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0)
      upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** The four hull points enclosing the most area: the card's corners. */
function largestQuad(hull: Point[]) {
  const count = hull.length;
  if (count < 4) return null;
  let best: Point[] | null = null;
  let bestArea = 0;
  for (let i = 0; i < count; i++)
    for (let k = i + 2; k < count; k++) {
      let left = 0;
      let leftPoint = -1;
      for (let j = i + 1; j < k; j++) {
        const area = triangle(hull[i], hull[j], hull[k]);
        if (area > left) [left, leftPoint] = [area, j];
      }
      let right = 0;
      let rightPoint = -1;
      for (let l = k + 1; l < count + i; l++) {
        const area = triangle(hull[k], hull[l % count], hull[i]);
        if (area > right) [right, rightPoint] = [area, l % count];
      }
      if (leftPoint < 0 || rightPoint < 0 || left + right <= bestArea) continue;
      bestArea = left + right;
      best = [hull[i], hull[leftPoint], hull[k], hull[rightPoint]];
    }
  return best;
}

/** Corners in reading order: top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(points: Point[]): Point[] {
  const centre = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  const clockwise = [...points].sort(
    (a, b) =>
      Math.atan2(a.y - centre.y, a.x - centre.x) - Math.atan2(b.y - centre.y, b.x - centre.x),
  );
  const first = clockwise.reduce(
    (best, point, index) =>
      point.x + point.y < clockwise[best].x + clockwise[best].y ? index : best,
    0,
  );
  return [...clockwise.slice(first), ...clockwise.slice(0, first)];
}

/**
 * Find the card in a small photo. Null when nothing card-shaped stands out from the background,
 * or when it fills the whole frame (already cropped).
 */
export function findDocumentQuad(pixels: Uint8ClampedArray, width: number, height: number) {
  let mask = foregroundMask(pixels, width, height);
  // Close (dilate, then erode back) to fill the card's text and glare gaps, then open
  // (erode, then dilate back) to cut thin joins to whatever touches it and drop specks.
  const radius = Math.max(1, Math.round(Math.min(width, height) / 100));
  const steps = (dilate: boolean) => Array<boolean>(radius).fill(dilate);
  for (const dilate of [...steps(true), ...steps(false), ...steps(false), ...steps(true)])
    mask = morph(mask, width, height, dilate);
  const region = largestRegion(mask, width);
  if (region.length < width * height * 0.08) return null;
  const hull = convexHull(region);
  const quad = largestQuad(hull);
  if (!quad) return null;
  const area = polygonArea(quad);
  // The region must actually be four-sided, not a blob, and must not be the whole photo.
  if (area < polygonArea(hull) * 0.88 || area > width * height * 0.95) return null;
  const corners = orderCorners(quad);
  const sides = corners.map((corner, index) => distance(corner, corners[(index + 1) % 4]));
  if (Math.min(...sides) < Math.max(...sides) * 0.25) return null;
  return corners;
}

/** Solve the 3×3 homography taking `from` corners to `to` corners. */
export function homography(from: Point[], to: Point[]) {
  const rows: number[][] = [];
  for (let index = 0; index < 4; index++) {
    const { x, y } = from[index];
    const { x: u, y: v } = to[index];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++)
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const lead = rows[column][column];
    if (Math.abs(lead) < 1e-12) return null;
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = rows[row][column] / lead;
      for (let k = column; k < 9; k++) rows[row][k] -= factor * rows[column][k];
    }
  }
  const h = rows.map((row, index) => row[8] / row[index]);
  return [...h, 1];
}

/** The flat size of a card seen at an angle: its longer opposite sides, scaled to `maxWidth`. */
export function flatSize(corners: Point[], maxWidth = 2000) {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const width = Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight));
  const height = Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight));
  const scale = Math.min(maxWidth / Math.max(width, height), 3);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Warp the quadrilateral in `source` onto a flat `width`×`height` image (bilinear sampling). */
export function warpDocument(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  corners: Point[],
  width: number,
  height: number,
) {
  const target = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  // Map each output pixel back into the photo.
  const h = homography(target, corners);
  if (!h) return null;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let v = 0; v < height; v++)
    for (let u = 0; u < width; u++) {
      const w = h[6] * u + h[7] * v + h[8];
      const x = Math.min(sourceWidth - 1.001, Math.max(0, (h[0] * u + h[1] * v + h[2]) / w));
      const y = Math.min(sourceHeight - 1.001, Math.max(0, (h[3] * u + h[4] * v + h[5]) / w));
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const a = (y0 * sourceWidth + x0) * 4;
      const b = a + 4;
      const c = a + sourceWidth * 4;
      const d = c + 4;
      const offset = (v * width + u) * 4;
      for (let channel = 0; channel < 3; channel++)
        out[offset + channel] =
          (source[a + channel] * (1 - fx) + source[b + channel] * fx) * (1 - fy) +
          (source[c + channel] * (1 - fx) + source[d + channel] * fx) * fy;
      out[offset + 3] = 255;
    }
  return out;
}
