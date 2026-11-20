import { documentFileError, requirementFileTypes } from "@/lib/storage/document-validation";
import { extractIdAddress, type DetectedIdAddress } from "./id-address";
import { prepareIdImage } from "./id-image";

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
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(45_000)]);
  const error = await documentFileError(file, requirementFileTypes);
  if (error) throw new Error(error);
  signal.throwIfAborted();
  let worker: import("tesseract.js").Worker | undefined;
  const recognize = async (image: File | HTMLCanvasElement) => {
    signal.throwIfAborted();
    const { createWorker, PSM } = await import("tesseract.js");
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
    await abortable(worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO }), signal);
    let { data } = await abortable(worker.recognize(image), signal);
    signal.throwIfAborted();
    let found = extractIdAddress(data.text);
    if (!found?.currentCity || !found.currentBarangay) {
      await abortable(worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT }), signal);
      const retry = await abortable(worker.recognize(image), signal);
      signal.throwIfAborted();
      const detected = extractIdAddress(retry.data.text);
      if (detected && Object.keys(detected).length > Object.keys(found ?? {}).length)
        found = detected;
      if (retry.data.confidence > data.confidence) data = retry.data;
    }
    if (!found && (data.text.replace(/[^a-z0-9]/gi, "").length < 10 || data.confidence < 25))
      throw new Error("The ID text could not be read clearly.");
    return found;
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
        return await recognize(canvas);
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
        if (detected && (!found || Object.keys(detected).length > Object.keys(found).length))
          found = detected;
        if (found?.currentCity && found.currentBarangay) return found;
      }
      return found;
    } finally {
      signal.removeEventListener("abort", cancelPdf);
      await task.destroy();
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    await worker?.terminate();
  }
}
