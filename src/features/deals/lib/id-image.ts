/** Find a substantial dark-content region, ignoring isolated marks on a light photo background. */
export function idTextBounds(pixels: Uint8ClampedArray, width: number, height: number) {
  const rows = new Uint32Array(height);
  const columns = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (
        pixels[offset + 3] > 128 &&
        pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114 < 115
      ) {
        rows[y]++;
        columns[x]++;
      }
    }
  }
  const top = rows.findIndex((value) => value >= Math.max(3, width * 0.008));
  const bottom = rows.findLastIndex((value) => value >= Math.max(3, width * 0.008));
  const left = columns.findIndex((value) => value >= Math.max(3, height * 0.008));
  const right = columns.findLastIndex((value) => value >= Math.max(3, height * 0.008));
  if (top < 0 || left < 0 || right - left < width * 0.2 || bottom - top < height * 0.08)
    return null;
  const pad = Math.ceil(Math.max(right - left, bottom - top) * 0.06);
  const x = Math.max(0, left - pad);
  const y = Math.max(0, top - pad);
  const w = Math.min(width, right + pad + 1) - x;
  const h = Math.min(height, bottom + pad + 1) - y;
  // shortcut: crop only clear margins on light backgrounds; retain the whole image otherwise.
  return w * h < width * height * 0.85 ? { x, y, width: w, height: h } : null;
}

export function prepareIdImage(image: ImageBitmap) {
  const sample = document.createElement("canvas");
  const sampleScale = Math.min(1, 640 / Math.max(image.width, image.height));
  sample.width = Math.ceil(image.width * sampleScale);
  sample.height = Math.ceil(image.height * sampleScale);
  const reader = sample.getContext("2d", { willReadFrequently: true });
  if (!reader) throw new Error("Image could not be opened");
  let bounds;
  try {
    reader.drawImage(image, 0, 0, sample.width, sample.height);
    bounds = idTextBounds(
      reader.getImageData(0, 0, sample.width, sample.height).data,
      sample.width,
      sample.height,
    );
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
