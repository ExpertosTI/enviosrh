const DB_NAME = 'enviosrh_offline';
const STORE = 'queue';
const DB_VERSION = 1;

export interface OfflineAction {
  id: string;
  method: 'POST' | 'PATCH';
  path: string;
  body?: unknown;
  createdAt: number;
  retries: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    fn(store).then(resolve).catch(reject);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAll(): Promise<OfflineAction[]> {
  return withStore('readonly', (store) => new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as OfflineAction[]).sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  }));
}

export async function enqueueAction(action: Omit<OfflineAction, 'id' | 'createdAt' | 'retries'>) {
  const item: OfflineAction = { ...action, id: crypto.randomUUID(), createdAt: Date.now(), retries: 0 };
  await withStore('readwrite', (store) => new Promise<void>((resolve, reject) => {
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

function backoffMs(retries: number) {
  return Math.min(60000, 1000 * 2 ** retries);
}

export async function syncOfflineQueue(
  executor: (method: string, path: string, body?: unknown) => Promise<void>,
) {
  const q = await getAll();
  if (!q.length) return 0;
  let synced = 0;
  for (const item of q) {
    if (item.retries > 0 && Date.now() - item.createdAt < backoffMs(item.retries)) continue;
    try {
      await executor(item.method, item.path, item.body);
      await withStore('readwrite', (store) => new Promise<void>((resolve, reject) => {
        const req = store.delete(item.id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }));
      synced++;
    } catch {
      await withStore('readwrite', (store) => new Promise<void>((resolve, reject) => {
        const req = store.put({ ...item, retries: item.retries + 1 });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }));
    }
  }
  return synced;
}

export async function getQueueSize() {
  const q = await getAll();
  return q.length;
}

// Migrar cola legacy de localStorage
(async () => {
  try {
    const legacy = localStorage.getItem('enviosrh_offline_queue');
    if (!legacy) return;
    const items = JSON.parse(legacy) as Omit<OfflineAction, 'retries'>[];
    for (const it of items) {
      await enqueueAction({ method: it.method, path: it.path, body: it.body });
    }
    localStorage.removeItem('enviosrh_offline_queue');
  } catch { /* ignore */ }
})();
