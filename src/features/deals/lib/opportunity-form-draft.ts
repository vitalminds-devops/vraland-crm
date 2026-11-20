import type { OpportunityAddress } from "@/features/contacts/schemas/opportunity-contact.schema";

export type OpportunityFormDraft = {
  step: 1 | 2 | 3 | 4;
  address: OpportunityAddress;
  budget: string;
  tinNumber: string;
  developmentId: string;
  buildingId: string | null;
  unitIds: string[];
  parkingSelection: { buildingId: string | null; ids: string[] };
  financing: string;
  nextType: string;
  idFile: File | null;
  appointmentFile: File | null;
  extras: { file: File; type: string }[];
  fields: Record<string, string>;
};

type StoredDraft = { version: 1; expiresAt: number; value: OpportunityFormDraft };
type DraftFields = Omit<OpportunityFormDraft, "idFile" | "appointmentFile" | "extras">;
const cacheKey = (key: string) => `vraland:opportunity:${key}`;

export function cacheOpportunityFormDraft(key: string, value: OpportunityFormDraft) {
  const fields = Object.fromEntries(
    Object.entries(value).filter(
      ([name]) => !["idFile", "appointmentFile", "extras"].includes(name),
    ),
  );
  sessionStorage.setItem(
    cacheKey(key),
    JSON.stringify({ version: 1, expiresAt: Date.now() + 24 * 60 * 60 * 1000, value: fields }),
  );
}

let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("vraland-opportunity-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", mode);
    const request = run(tx.objectStore("drafts"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Draft storage unavailable"));
  });
}

export async function loadOpportunityFormDraft(key: string): Promise<OpportunityFormDraft | null> {
  let cached: { version: number; expiresAt: number; value: DraftFields } | null = null;
  try {
    const value = JSON.parse(sessionStorage.getItem(cacheKey(key)) ?? "null");
    if (
      value?.version === 1 &&
      value.expiresAt > Date.now() &&
      [1, 2, 3, 4].includes(value.value?.step)
    )
      cached = value;
    else sessionStorage.removeItem(cacheKey(key));
  } catch {
    /* IndexedDB remains available when session storage is blocked. */
  }
  const saved: StoredDraft | undefined = await transaction("readwrite", (store) => {
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      if (!cursor.result) return;
      if (cursor.result.value.expiresAt <= Date.now()) cursor.result.delete();
      cursor.result.continue();
    };
    return store.get(key);
  });
  const stored = saved?.version === 1 && saved.expiresAt > Date.now() ? saved.value : null;
  return cached
    ? { ...(stored ?? { idFile: null, appointmentFile: null, extras: [] }), ...cached.value }
    : stored;
}

export async function saveOpportunityFormDraft(key: string, value: OpportunityFormDraft) {
  await transaction("readwrite", (store) =>
    store.put(
      { version: 1, expiresAt: Date.now() + 24 * 60 * 60 * 1000, value } satisfies StoredDraft,
      key,
    ),
  );
}

export async function removeOpportunityFormDraft(key: string) {
  try {
    sessionStorage.removeItem(cacheKey(key));
  } catch {
    /* Clear the durable files below. */
  }
  await transaction("readwrite", (store) => store.delete(key));
}
