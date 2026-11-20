import { beforeEach, expect, it, vi } from "vitest";
import { readIdAddress } from "./read-id-address";

const mock = vi.hoisted(() => ({
  recognize: vi.fn(),
  setParameters: vi.fn(),
  terminate: vi.fn(),
  createWorker: vi.fn(),
  getDocument: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("tesseract.js", () => ({
  createWorker: mock.createWorker,
  PSM: { AUTO: "3", SPARSE_TEXT: "11" },
}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: mock.getDocument,
}));
const image = () =>
  new File([new Uint8Array([255, 216, 255, 0])], "id.jpg", { type: "image/jpeg" });
const address = "ADDRESS: 123 RIZAL ST, BRGY LAHUG, CEBU CITY, CEBU 6000";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("location", { origin: "https://crm.example.invalid" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true })),
  );
  mock.recognize.mockResolvedValue({ data: { text: address } });
  mock.createWorker.mockResolvedValue({
    recognize: mock.recognize,
    terminate: mock.terminate,
    setParameters: mock.setParameters,
  });
  mock.setParameters.mockResolvedValue(undefined);
  mock.terminate.mockResolvedValue(undefined);
  mock.destroy.mockResolvedValue(undefined);
});
it("recognizes locally and terminates the worker", async () => {
  expect(await readIdAddress(image(), new AbortController().signal, vi.fn())).toMatchObject({
    currentCity: "Cebu City",
    currentBarangay: "Lahug",
  });
  expect(mock.createWorker).toHaveBeenCalledWith(
    "eng",
    1,
    expect.objectContaining({
      workerPath: "https://crm.example.invalid/ocr/worker.min.js",
      langPath: "https://crm.example.invalid/ocr",
      workerBlobURL: false,
    }),
  );
  expect(fetch).toHaveBeenCalledWith(
    "/ocr/eng.traineddata.gz",
    expect.objectContaining({ method: "HEAD" }),
  );
  expect(mock.terminate).toHaveBeenCalled();
});
it("returns no address when the text contains no residential address", async () => {
  mock.recognize.mockResolvedValue({
    data: { text: "LAND TRANSPORTATION OFFICE\nQUEZON CITY" },
  });
  expect(await readIdAddress(image(), new AbortController().signal, vi.fn())).toBeNull();
});
it("rejects unsupported file contents before starting OCR", async () => {
  await expect(
    readIdAddress(
      new File(["not a real image"], "id.png", { type: "image/png" }),
      new AbortController().signal,
      vi.fn(),
    ),
  ).rejects.toThrow("do not match");
  expect(mock.createWorker).not.toHaveBeenCalled();
});
it.each([
  { text: "", confidence: 0 },
  { text: "unrecognizable scan text", confidence: 12 },
])("distinguishes unreadable text from an ID without an address", async (data) => {
  mock.recognize.mockResolvedValue({ data });
  await expect(readIdAddress(image(), new AbortController().signal, vi.fn())).rejects.toThrow(
    "could not be read clearly",
  );
  expect(mock.terminate).toHaveBeenCalled();
});
it("retries sparse ID text before reporting that the address could not be detected", async () => {
  mock.recognize.mockResolvedValueOnce({
    data: { text: "DRIVERS LICENSE TEST NAME", confidence: 70 },
  });
  expect(await readIdAddress(image(), new AbortController().signal, vi.fn())).toMatchObject({
    currentCity: "Cebu City",
    currentBarangay: "Lahug",
  });
  expect(mock.setParameters).toHaveBeenCalledWith({ tessedit_pageseg_mode: "11" });
  expect(mock.recognize).toHaveBeenCalledTimes(2);
});
it("reads a PDF text layer without starting an OCR worker", async () => {
  mock.getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({ items: [{ str: address, hasEOL: true }] }),
      }),
    }),
    destroy: mock.destroy,
  });
  expect(
    await readIdAddress(
      new File(["%PDF-1.7\n"], "id.pdf", { type: "application/pdf" }),
      new AbortController().signal,
      vi.fn(),
    ),
  ).toMatchObject({ currentCity: "Cebu City" });
  expect(mock.createWorker).not.toHaveBeenCalled();
  expect(mock.destroy).toHaveBeenCalled();
});
it("cancels an obsolete scan and releases its worker", async () => {
  mock.recognize.mockReturnValueOnce(new Promise(() => {}));
  const controller = new AbortController();
  const scan = readIdAddress(image(), controller.signal, vi.fn());
  const rejected = expect(scan).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(mock.recognize).toHaveBeenCalled());
  controller.abort();
  await rejected;
  expect(mock.terminate).toHaveBeenCalled();
});
it("reports missing local recognition assets without starting a worker", async () => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
  await expect(readIdAddress(image(), new AbortController().signal, vi.fn())).rejects.toThrow(
    "unavailable",
  );
  expect(mock.createWorker).not.toHaveBeenCalled();
});
