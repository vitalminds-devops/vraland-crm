import { documentFileError, requirementFileTypes } from "@/lib/storage/document-validation";
import { extractIdAddress, filledFieldCount, type DetectedIdAddress } from "./id-address";
import { completeWithGuess } from "./id-address-guess";
import { blackAndWhite, localBlackAndWhite, prepareIdImage, turnedCanvas } from "./id-image";

const idWords = /\b(?:ADDRESS|TIRAHAN|REPUBLI[CK]A?|PILIPINAS|PHILIPPINES|LICENSE)\b/i;

async function abortable<T>(job: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let cancel!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([job, aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

/** Recognition runs locally; only worker code and language assets are requested from this app. */
export async function readIdAddress(
  file: File,
  parentSignal: AbortSignal,
  onProgress: (progress: number) => void,
): Promise<DetectedIdAddress | null> {
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(90_000)]);
  const error = await documentFileError(file, requirementFileTypes);
  if (error) throw new Error(error);
  signal.throwIfAborted();
  let worker: import("tesseract.js").Worker | undefined;
  // Every read's text, so a garbled address can still be pieced together across reads.
  const texts: string[] = [];
  const startWorker = async () => {
    signal.throwIfAborted();
    const { createWorker } = await import("tesseract.js");
    if (!worker) {
      // Fail before worker startup when a deployment has omitted the local recognition model.
      if (!(await fetch("/ocr/eng.traineddata.gz", { method: "HEAD", signal })).ok)
        throw new Error("ID recognition is unavailable. Enter the address manually.");
      let startupFailed!: (reason: Error) => void;
      const failure = new Promise<never>((_, reject) => {
        startupFailed = reject;
      });
      const initializing = createWorker("eng", 1, {
        workerPath: new URL("/ocr/worker.min.js", location.origin).href,
        corePath: new URL("/ocr/core", location.origin).href,
        langPath: new URL("/ocr", location.origin).href,
        workerBlobURL: false,
        logger: (message) => {
          if (!signal.aborted && message.status === "recognizing text")
            onProgress(Math.round(message.progress * 100));
        },
        errorHandler: (reason) =>
          startupFailed(new Error(typeof reason === "string" ? reason : "ID recognition failed")),
      });
      void initializing
        .then((created) => {
          if (signal.aborted) void created.terminate();
        })
        .catch(() => {});
      worker = await abortable(Promise.race([initializing, failure]), signal);
    }
    signal.throwIfAborted();
    return worker;
  };
  const recognize = async (image: File | HTMLCanvasElement) => {
    const worker = await startWorker();
    const { PSM } = await import("tesseract.js");
    await abortable(worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO }), signal);
    let { data } = await abortable(worker.recognize(image), signal);
    signal.throwIfAborted();
    texts.push(data.text);
    let found = extractIdAddress(data.text);
    if (!found?.currentCity || !found.currentBarangay) {
      await abortable(worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT }), signal);
      const retry = await abortable(worker.recognize(image), signal);
      signal.throwIfAborted();
      texts.push(retry.data.text);
      const detected = extractIdAddress(retry.data.text);
      if (detected && filledFieldCount(detected) > filledFieldCount(found)) found = detected;
      if (retry.data.confidence > data.confidence) data = retry.data;
    }
    if (!found && (data.text.replace(/[^a-z0-9]/gi, "").length < 10 || data.confidence < 25))
      throw new Error("The ID text could not be read clearly.");
    return found;
  };
  // Tesseract reads only upright text, and phones often photograph an ID sideways.
  const uprightTurns = async (source: HTMLCanvasElement) => {
    const worker = await startWorker();
    const { PSM } = await import("tesseract.js");
    await abortable(worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO }), signal);
    let best = { turns: 0, score: -1 };
    for (const turns of [0, 1, 3, 2]) {
      const preview = turnedCanvas(source, turns, 1200);
      try {
        const { data } = await abortable(worker.recognize(preview), signal);
        const score = data.confidence + (idWords.test(data.text) ? 40 : 0);
        if (score > best.score) best = { turns, score };
        // A confident upright read that looks like an ID skips the other turns.
        if (turns === 0 && score >= 100) break;
      } finally {
        preview.width = preview.height = 0;
      }
    }
    return best.turns;
  };
  const cancel = () => {
    void worker?.terminate();
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (file.type !== "application/pdf") {
      if (typeof createImageBitmap !== "function") return await recognize(file);
      const image = await createImageBitmap(file);
      let canvas: HTMLCanvasElement | undefined;
      try {
        canvas = prepareIdImage(image);
        const turns = await uprightTurns(canvas);
        if (turns) {
          const upright = turnedCanvas(canvas, turns);
          canvas.width = canvas.height = 0;
          canvas = upright;
        }
        const read = (target: HTMLCanvasElement) =>
          recognize(target).catch((error: unknown) => {
            if (signal.aborted) throw error;
            return error instanceof Error ? error : new Error("ID recognition failed");
          });
        // Black and white reads best on patterned cards: one cut-off for evenly lit photos,
        // a local one for uneven light (webcams, shadows). The plain image is the last resort.
        const plain = canvas;
        const cleanups: ((pixels: Uint8ClampedArray, width: number, height: number) => void)[] = [
          (pixels) => blackAndWhite(pixels),
          localBlackAndWhite,
          () => {},
        ];
        const results: (DetectedIdAddress | Error | null)[] = [];
        for (const cleanup of cleanups) {
          const copy = turnedCanvas(plain, 0);
          try {
            const context = copy.getContext("2d");
            if (!context) throw new Error("Image could not be opened");
            const pixels = context.getImageData(0, 0, copy.width, copy.height);
            cleanup(pixels.data, copy.width, copy.height);
            context.putImageData(pixels, 0, 0);
            const result = await read(copy);
            if (!(result instanceof Error) && result?.currentCity && result.currentBarangay)
              return result;
            results.push(result);
          } finally {
            copy.width = copy.height = 0;
          }
        }
        const found = results.filter(
          (result): result is DetectedIdAddress => Boolean(result) && !(result instanceof Error),
        );
        const best = found.sort((a, b) => filledFieldCount(b) - filledFieldCount(a))[0];
        const completed = completeWithGuess(best ?? null, texts);
        const last = results.at(-1);
        if (!completed && last instanceof Error) throw last;
        return completed;
      } finally {
        image.close();
        if (canvas) canvas.width = canvas.height = 0;
      }
    }
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useWasm: false,
    });
    const cancelPdf = () => {
      void task.destroy();
    };
    signal.addEventListener("abort", cancelPdf, { once: true });
    try {
      const pdf = await task.promise;
      let found: DetectedIdAddress | null = null;
      // shortcut: ID scans cover the front and back; expand this for multi-document packets.
      for (let index = 1; index <= Math.min(pdf.numPages, 2); index++) {
        signal.throwIfAborted();
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
          .join("");
        texts.push(text);
        let detected = extractIdAddress(text);
        if (!detected?.currentCity || !detected.currentBarangay) {
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: Math.min(2, Math.sqrt(5_000_000 / (base.width * base.height))),
          });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          try {
            await page.render({ canvas, viewport }).promise;
            detected = (await recognize(canvas)) ?? detected;
          } finally {
            canvas.width = canvas.height = 0;
          }
        }
        if (detected && (!found || filledFieldCount(detected) > filledFieldCount(found)))
          found = detected;
        if (found?.currentCity && found.currentBarangay) return found;
      }
      return completeWithGuess(found, texts);
    } finally {
      signal.removeEventListener("abort", cancelPdf);
      await task.destroy();
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    await worker?.terminate();
  }
}
