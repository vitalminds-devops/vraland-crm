import { findDocumentQuad, flatSize, warpDocument } from "./document-scan";

const luminance = (pixels: Uint8ClampedArray, offset: number) =>
  pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;

function regionBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  inside: (offset: number) => boolean,
  share: number,
) {
  const rows = new Uint32Array(height);
  const columns = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (inside((y * width + x) * 4)) {
        rows[y]++;
        columns[x]++;
      }
    }
  }
  const top = rows.findIndex((value) => value >= Math.max(3, width * share));
  const bottom = rows.findLastIndex((value) => value >= Math.max(3, width * share));
  const left = columns.findIndex((value) => value >= Math.max(3, height * share));
  const right = columns.findLastIndex((value) => value >= Math.max(3, height * share));
  if (top < 0 || left < 0 || right - left < width * 0.2 || bottom - top < height * 0.08)
    return null;
  const pad = Math.ceil(Math.max(right - left, bottom - top) * 0.06);
  const x = Math.max(0, left - pad);
  const y = Math.max(0, top - pad);
  const w = Math.min(width, right + pad + 1) - x;
  const h = Math.min(height, bottom + pad + 1) - y;
  // shortcut: crop only clear margins; retain the whole image otherwise.
  return w * h < width * height * 0.85 ? { x, y, width: w, height: h } : null;
}

/** Find a substantial dark-content region, ignoring isolated marks on a light photo background. */
export function idTextBounds(pixels: Uint8ClampedArray, width: number, height: number) {
  return regionBounds(
    pixels,
    width,
    height,
    (offset) => pixels[offset + 3] > 128 && luminance(pixels, offset) < 115,
    0.008,
  );
}

/** Find a light card lying on a dark surface, such as an ID photographed on a table. */
export function idCardBounds(pixels: Uint8ClampedArray, width: number, height: number) {
  return regionBounds(
    pixels,
    width,
    height,
    (offset) => pixels[offset + 3] > 128 && luminance(pixels, offset) > 150,
    0.15,
  );
}

/**
 * Turn the image black and white so the light security print behind the text disappears.
 * The cut-off sits 40% of the way from the ink (darkest 5%) to the card (median), so it
 * follows the photo's lighting; Otsu's method cut too light on a sample licence.
 */
export function blackAndWhite(pixels: Uint8ClampedArray) {
  const histogram = new Uint32Array(256);
  for (let offset = 0; offset < pixels.length; offset += 4)
    histogram[Math.round(luminance(pixels, offset))]++;
  const total = pixels.length / 4;
  const level = (share: number) => {
    let seen = 0;
    for (let value = 0; value < 256; value++)
      if ((seen += histogram[value]) > total * share) return value;
    return 255;
  };
  const ink = level(0.05);
  const cutoff = ink + (level(0.5) - ink) * 0.4;
  for (let offset = 0; offset < pixels.length; offset += 4)
    pixels[offset] =
      pixels[offset + 1] =
      pixels[offset + 2] =
        luminance(pixels, offset) < cutoff ? 0 : 255;
}

/**
 * Black and white with a cut-off that follows each neighbourhood (Sauvola's method), for
 * photos lit unevenly: a webcam, a shadow, light from a window. One cut-off for the whole
 * photo wipes out the darker side's text. The window slides row by row over running column
 * sums, so memory stays at one byte per pixel (statistics at half size lost thin strokes).
 */
export function localBlackAndWhite(pixels: Uint8ClampedArray, width: number, height: number) {
  const lum = new Float32Array(width * height);
  for (let index = 0; index < lum.length; index++) lum[index] = luminance(pixels, index * 4);
  // A window about 1/25 of the width spans a few letters; k = 0.1 tested best on a webcam licence.
  const radius = Math.max(8, Math.round(width / 50));
  const columnSums = new Float64Array(width);
  const columnSquares = new Float64Array(width);
  const addRow = (row: number, sign: 1 | -1) => {
    for (let x = 0; x < width; x++) {
      const value = lum[row * width + x];
      columnSums[x] += sign * value;
      columnSquares[x] += sign * value * value;
    }
  };
  for (let row = 0; row < Math.min(height, radius); row++) addRow(row, 1);
  for (let y = 0; y < height; y++) {
    if (y + radius < height) addRow(y + radius, 1);
    if (y - radius - 1 >= 0) addRow(y - radius - 1, -1);
    const rows = Math.min(height - 1, y + radius) - Math.max(0, y - radius) + 1;
    let sum = 0;
    let squares = 0;
    for (let x = 0; x < Math.min(width, radius); x++) {
      sum += columnSums[x];
      squares += columnSquares[x];
    }
    for (let x = 0; x < width; x++) {
      if (x + radius < width) {
        sum += columnSums[x + radius];
        squares += columnSquares[x + radius];
      }
      if (x - radius - 1 >= 0) {
        sum -= columnSums[x - radius - 1];
        squares -= columnSquares[x - radius - 1];
      }
      const area = rows * (Math.min(width - 1, x + radius) - Math.max(0, x - radius) + 1);
      const mean = sum / area;
      const deviation = Math.sqrt(Math.max(0, squares / area - mean * mean));
      const cutoff = mean * (1 + 0.1 * (deviation / 128 - 1));
      const offset = (y * width + x) * 4;
      pixels[offset] =
        pixels[offset + 1] =
        pixels[offset + 2] =
          lum[y * width + x] < cutoff ? 0 : 255;
    }
  }
}

type Rect = { x: number; y: number; width: number; height: number };

function pixelsOf(image: CanvasImageSource, region: Rect, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** Find the card within `region` of a photo, at the small size detection works on. */
function findCard(image: CanvasImageSource, region: Rect) {
  const scale = Math.min(1, 400 / Math.max(region.width, region.height));
  const width = Math.max(1, Math.round(region.width * scale));
  const height = Math.max(1, Math.round(region.height * scale));
  const pixels = pixelsOf(image, region, width, height);
  const quad = pixels && findDocumentQuad(pixels, width, height);
  return (
    quad?.map((point) => ({ x: region.x + point.x / scale, y: region.y + point.y / scale })) ?? null
  );
}

/**
 * The card in a photo, straightened and cropped like a phone's document camera,
 * or null when no card stands out from the background.
 */
export function flattenedCard(image: CanvasImageSource, region: Rect) {
  const corners = findCard(image, region);
  if (!corners) return null;
  const x = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.x))));
  const y = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.y))));
  const right = Math.min(region.x + region.width, Math.ceil(Math.max(...corners.map((p) => p.x))));
  const bottom = Math.min(
    region.y + region.height,
    Math.ceil(Math.max(...corners.map((p) => p.y))),
  );
  const box = { x, y, width: right - x, height: bottom - y };
  const source = pixelsOf(image, box, box.width, box.height);
  if (!source) return null;
  const size = flatSize(corners, 1800);
  const flat = warpDocument(
    source,
    box.width,
    box.height,
    corners.map((point) => ({ x: point.x - x, y: point.y - y })),
    size.width,
    size.height,
  );
  if (!flat) return null;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")?.putImageData(new ImageData(flat, size.width, size.height), 0, 0);
  return canvas;
}

export function prepareIdImage(image: ImageBitmap) {
  // A card photographed at an angle reads best flattened, as a document camera would.
  const flat = flattenedCard(image, { x: 0, y: 0, width: image.width, height: image.height });
  if (flat) return flat;
  const sample = document.createElement("canvas");
  const sampleScale = Math.min(1, 640 / Math.max(image.width, image.height));
  sample.width = Math.ceil(image.width * sampleScale);
  sample.height = Math.ceil(image.height * sampleScale);
  const reader = sample.getContext("2d", { willReadFrequently: true });
  if (!reader) throw new Error("Image could not be opened");
  let bounds;
  try {
    reader.drawImage(image, 0, 0, sample.width, sample.height);
    const pixels = reader.getImageData(0, 0, sample.width, sample.height).data;
    bounds =
      idTextBounds(pixels, sample.width, sample.height) ??
      idCardBounds(pixels, sample.width, sample.height);
  } finally {
    sample.width = sample.height = 0;
  }
  const crop = bounds
    ? {
        x: bounds.x / sampleScale,
        y: bounds.y / sampleScale,
        width: bounds.width / sampleScale,
        height: bounds.height / sampleScale,
      }
    : { x: 0, y: 0, width: image.width, height: image.height };
  const scale = Math.min(
    3,
    Math.max(1, 2200 / crop.width),
    Math.sqrt(5_000_000 / (crop.width * crop.height)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(crop.width * scale);
  canvas.height = Math.ceil(crop.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image could not be opened");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

/** Copy the image turned clockwise by quarter turns, with its longest side at most `maxSide`. */
export function turnedCanvas(source: HTMLCanvasElement, quarterTurns: number, maxSide = Infinity) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = quarterTurns % 2 ? height : width;
  canvas.height = quarterTurns % 2 ? width : height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image could not be opened");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((quarterTurns * Math.PI) / 2);
  context.drawImage(source, -width / 2, -height / 2, width, height);
  return canvas;
}
