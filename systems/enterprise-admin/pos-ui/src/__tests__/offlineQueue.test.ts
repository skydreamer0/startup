import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutPayload } from '../api/pos';

interface StoredRecord {
  localId?: number;
  localOrderNumber: string;
  payload: CheckoutPayload;
  createdAt: string;
  synced: boolean;
}

class FakeRequest<T = unknown> {
  result!: T;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
}

function resolveRequest<T>(request: FakeRequest<T>, result: T) {
  request.result = result;
  queueMicrotask(() => request.onsuccess?.());
}

function installIndexedDbFake(initialRecords: StoredRecord[] = []) {
  let nextId = 1;
  const records = initialRecords.map((record) => ({ ...record, localId: record.localId ?? nextId++ }));
  const store = {
    count: () => {
      const request = new FakeRequest<number>();
      resolveRequest(request, records.length);
      return request;
    },
    add: (record: StoredRecord) => {
      const request = new FakeRequest<number>();
      records.push({ ...record, localId: nextId++ });
      resolveRequest(request, records.length);
      return request;
    },
    getAll: () => {
      const request = new FakeRequest<StoredRecord[]>();
      resolveRequest(request, records.map((record) => ({ ...record })));
      return request;
    },
    get: (localId: number) => {
      const request = new FakeRequest<StoredRecord | undefined>();
      resolveRequest(request, records.find((record) => record.localId === localId));
      return request;
    },
    put: (record: StoredRecord) => {
      const request = new FakeRequest<number>();
      const index = records.findIndex((item) => item.localId === record.localId);
      if (index >= 0 && record.localId !== undefined) records[index] = { ...record, localId: record.localId };
      resolveRequest(request, record.localId ?? 0);
      return request;
    },
  };
  const db = {
    createObjectStore: vi.fn(),
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => store),
    })),
  };
  const indexedDB = {
    open: vi.fn(() => {
      const request = new FakeRequest<typeof db>();
      request.result = db;
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }),
  };
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: indexedDB,
  });
  return { records, indexedDB };
}

const payload: CheckoutPayload = {
  cartItems: [{ productId: 'p1', quantity: 2, discountRate: 0 }],
  paymentMethod: 'CASH',
  orderDiscountAmount: 0,
  shiftId: 'shift-1',
};

describe('offlineQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T12:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);
  });

  it('enqueues a pending transaction with a local order number', async () => {
    const { enqueuePending, getPendingCount } = await import('../services/offlineQueue');
    installIndexedDbFake();

    const record = await enqueuePending(payload);

    expect(record.localOrderNumber).toMatch(/^LOCAL-20260517-/);
    expect(record.payload).toEqual(payload);
    expect(record.synced).toBe(false);
    await expect(getPendingCount()).resolves.toBe(1);
  });

  it('filters synced records from pending results', async () => {
    const { getPending } = await import('../services/offlineQueue');
    installIndexedDbFake([
      { localId: 1, localOrderNumber: 'LOCAL-1', payload, createdAt: 'now', synced: false },
      { localId: 2, localOrderNumber: 'LOCAL-2', payload, createdAt: 'now', synced: true },
    ]);

    const pending = await getPending();

    expect(pending).toHaveLength(1);
    expect(pending[0].localOrderNumber).toBe('LOCAL-1');
  });

  it('marks a pending transaction as synced', async () => {
    const { getPendingCount, markSynced } = await import('../services/offlineQueue');
    installIndexedDbFake([
      { localId: 1, localOrderNumber: 'LOCAL-1', payload, createdAt: 'now', synced: false },
    ]);

    await markSynced(1);

    await expect(getPendingCount()).resolves.toBe(0);
  });


  it('syncs pending transactions through a single checkout submission seam', async () => {
    const { syncPendingTransactions, getPendingCount } = await import('../services/offlineQueue');
    installIndexedDbFake([
      { localId: 1, localOrderNumber: 'LOCAL-1', payload, createdAt: 'now', synced: false },
      { localId: 2, localOrderNumber: 'LOCAL-2', payload, createdAt: 'now', synced: false },
    ]);
    const submit = vi.fn()
      .mockResolvedValueOnce({ data: { success: true } })
      .mockRejectedValueOnce(new Error('network'));

    await expect(syncPendingTransactions(submit)).resolves.toEqual({ successCount: 1, failureCount: 1 });
    expect(submit).toHaveBeenCalledTimes(2);
    await expect(getPendingCount()).resolves.toBe(1);
  });

  it('rejects new pending transactions when the queue reaches fifty records', async () => {
    const { enqueuePending } = await import('../services/offlineQueue');
    installIndexedDbFake(
      Array.from({ length: 50 }, (_, index) => ({
        localId: index + 1,
        localOrderNumber: `LOCAL-${index}`,
        payload,
        createdAt: 'now',
        synced: false,
      })),
    );

    await expect(enqueuePending(payload)).rejects.toThrow(/50/);
  });
});
