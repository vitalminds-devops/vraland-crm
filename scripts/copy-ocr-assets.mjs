import { copyFile, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve("public/ocr");
const core = path.dirname(require.resolve("tesseract.js-core"));
const engine = path.dirname(require.resolve("tesseract.js/package.json"));
const pdf = path.dirname(require.resolve("pdfjs-dist/package.json"));
await mkdir(path.join(root, "core"), { recursive: true });
const cores = (await readdir(core)).filter((name) =>
  /^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm(?:\.js)?$/.test(name),
);
await Promise.all([
  ...cores.map((name) => copyFile(path.join(core, name), path.join(root, "core", name))),
  copyFile(path.join(engine, "dist/worker.min.js"), path.join(root, "worker.min.js")),
  copyFile(path.join(pdf, "build/pdf.worker.min.mjs"), path.join(root, "pdf.worker.min.mjs")),
  copyFile(path.join(engine, "LICENSE.md"), path.join(root, "TESSERACT-LICENSE.md")),
  copyFile(path.join(pdf, "LICENSE"), path.join(root, "PDFJS-LICENSE")),
]);
try {
  const model = path.dirname(require.resolve("@tesseract.js-data/eng"));
  await copyFile(
    path.join(model, "4.0.0_best_int/eng.traineddata.gz"),
    path.join(root, "eng.traineddata.gz"),
  );
  console.log("Prepared local ID recognition assets.");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  console.warn(
    'ID image recognition needs the English model. Run: npm install "@tesseract.js-data/eng"',
  );
}
