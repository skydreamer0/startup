import { CheckoutPayload } from '../api/pos';

const DB_NAME = 'pos-offline';
const STORE_NAME = 'pending_transactions';
const MAX_PENDING = 50;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'localId', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface PendingTransaction {
  localId?: number;
  localOrderNumber: string;
  payload: CheckoutPayload;
  createdAt: string;
  synced: boolean;
}

export async function enqueuePending(payload: CheckoutPayload): Promise<PendingTransaction> {
  const db = await openDb();
  const count = await new Promise<number>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
  });

  if (count >= MAX_PENDING) {
    throw new Error('離線交易已達 50 筆上限，請先恢復網路並同步後再繼續結帳');
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const localOrderNumber = `LOCAL-${dateStr}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const record: PendingTransaction = { localOrderNumber, payload, createdAt: new Date().toISOString(), synced: false };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).add(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return record;
}

export async function getPending(): Promise<PendingTransaction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as PendingTransaction[]).filter((record) => !record.synced));
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const pending = await getPending();
  return pending.length;
}

export async function markSynced(localId: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const record = getReq.result as PendingTransaction;
      store.put({ ...record, synced: true });
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export interface SyncPendingResult {
  successCount: number;
  failureCount: number;
}

export async function syncPendingTransactions(
  submit: (payload: CheckoutPayload) => Promise<unknown>,
): Promise<SyncPendingResult> {
  const pending = await getPending();
  let successCount = 0;
  let failureCount = 0;

  for (const transaction of pending) {
    try {
      await submit(transaction.payload);
      if (transaction.localId !== undefined) await markSynced(transaction.localId);
      successCount += 1;
    } catch {
      failureCount += 1;
    }
  }

  return { successCount, failureCount };
}
