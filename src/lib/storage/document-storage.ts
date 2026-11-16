import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

export interface DocumentStorage {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const root = resolve(process.cwd(), ".data", "documents");
function pathFor(key: string) {
  const path = resolve(root, key);
  if (!path.startsWith(`${root}${sep}`)) throw new Error("Invalid storage key");
  return path;
}
const localStorage: DocumentStorage = {
  async put(key, body) {
    const path = pathFor(key);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, body, { flag: "wx" });
  },
  async get(key) {
    return readFile(pathFor(key));
  },
  async remove(key) {
    await unlink(pathFor(key)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  },
};
// In production this directory is the mounted /app/.data volume.
export function getDocumentStorage(): DocumentStorage {
  return localStorage;
}
