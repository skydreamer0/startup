import { MutableRefObject, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { PosProduct } from '../api/pos';
import { lookupProduct } from '../api/productLookup';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import {
  startBarcodeListener, stopBarcodeListener, onBarcode, onBarcodeSequence, getBarcodeInputSequence,
} from '../services/barcodeService';
import { PosToastMessage } from '../components/PosToast';

export type BarcodeLookupStatus = {
  kind: 'loading' | 'not-found' | 'error' | 'forbidden' | 'ambiguous' | 'found';
  message: string;
} | null;

export type BarcodeCandidateSelection = {
  code: string;
  products: PosProduct[];
  select: (productId: string) => void;
  dismiss: () => void;
};

function exactMatches(products: PosProduct[], code: string) {
  return products.filter((product) => product.sku === code || product.barcode === code);
}

function lookupProducts(value: unknown): PosProduct[] {
  if (!Array.isArray(value) || value.some((row: unknown) => {
    if (!row || typeof row !== 'object') return true;
    const product = row as Record<string, unknown>;
    const price = product.retailPrice;
    const category = product.category;
    if (category != null && (typeof category !== 'object'
      || typeof (category as Record<string, unknown>).id !== 'string'
      || typeof (category as Record<string, unknown>).name !== 'string')) return true;
    return typeof product.id !== 'string' || !product.id
      || typeof product.sku !== 'string' || !product.sku
      || typeof product.name !== 'string' || !product.name
      || (product.barcode !== undefined && typeof product.barcode !== 'string')
      || typeof product.stockQuantity !== 'number' || !Number.isInteger(product.stockQuantity)
      || product.stockQuantity < 0
      || (typeof price !== 'number' && typeof price !== 'string')
      || (typeof price === 'string' && !price.trim())
      || !Number.isFinite(Number(price)) || Number(price) < 0;
  })) throw new Error('Invalid product lookup response');
  return value as PosProduct[];
}

export function useBarcodeScanner(
  products: PosProduct[],
  searchRef: MutableRefObject<HTMLInputElement | null>,
  setSearchQuery: (q: string) => void,
  addItem: (product: PosProduct) => void,
  showToast: (msg: PosToastMessage) => void,
  onCandidates?: (selection: BarcodeCandidateSelection | null) => void,
  options: { blocked?: boolean; onStatus?: (status: BarcodeLookupStatus) => void } = {},
) {
  const blocked = options.blocked ?? false;
  const onStatus = options.onStatus;
  const previousBlocked = useRef(blocked);
  const generation = useRef(0);
  const selectionRevision = useRef(0);
  const mounted = useRef(false);
  const pausedSequence = useRef<number | null>(null);
  const waiters = useRef(new Set<() => void>());
  const latest = useRef({ products, searchRef, setSearchQuery, addItem, showToast, onCandidates, blocked, onStatus });
  useLayoutEffect(() => {
    latest.current = { products, searchRef, setSearchQuery, addItem, showToast, onCandidates, blocked, onStatus };
  }, [products, searchRef, setSearchQuery, addItem, showToast, onCandidates, blocked, onStatus]);

  // Only an explicit search/draft/checkout boundary invalidates scan intents.
  // Another scan or a product-query rerender must not swallow a valid earlier scan.
  const releaseWaiters = useCallback(() => {
    pausedSequence.current = null;
    waiters.current.forEach((resume) => resume());
    waiters.current.clear();
  }, []);
  const clearCandidates = useCallback(() => {
    selectionRevision.current += 1;
    if (mounted.current) latest.current.onCandidates?.(null);
  }, []);
  const invalidateLookups = useCallback(() => {
    clearCandidates();
    if (mounted.current) latest.current.onStatus?.(null);
    generation.current += 1;
    releaseWaiters();
  }, [releaseWaiters, clearCandidates]);
  const handleSearchInput = useCallback((event?: Event) => {
    const sequenceId = event ? getBarcodeInputSequence(event) : null;
    if (sequenceId !== null) pausedSequence.current = sequenceId;
    else invalidateLookups();
  }, [invalidateLookups]);

  useLayoutEffect(() => {
    if (previousBlocked.current !== blocked) invalidateLookups();
    previousBlocked.current = blocked;
  }, [blocked, invalidateLookups]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    const unsubscribeRecovery = useCheckoutRecoveryStore.subscribe((next, previous) => {
      if (next.pending || next.scope !== previous.scope) invalidateLookups();
    });
    const unsubscribeCart = useCartStore.subscribe((next, previous) => {
      if (next.draftRevision !== previous.draftRevision) invalidateLookups();
    });
    type IntentBoundary = { generation: number; draftRevision: number; blocked: boolean };
    let startedBoundary: IntentBoundary | null = null;
    let completedBoundary: IntentBoundary | null = null;
    const unsubscribeSequence = onBarcodeSequence((event) => {
      if (event.kind === 'started') {
        clearCandidates();
        latest.current.onStatus?.(null);
        startedBoundary = {
          generation: generation.current,
          draftRevision: useCartStore.getState().draftRevision,
          blocked: latest.current.blocked || !!useCheckoutRecoveryStore.getState().pending,
        };
        if (event.target === latest.current.searchRef.current) pausedSequence.current = event.id;
      } else if (event.kind === 'completed') {
        completedBoundary = startedBoundary;
        startedBoundary = null;
        if (pausedSequence.current === event.id) releaseWaiters();
      } else {
        startedBoundary = null;
        if (pausedSequence.current === event.id) invalidateLookups();
      }
    });
    startBarcodeListener();
    const unsubscribe = onBarcode((code) => {
      const boundary = completedBoundary;
      completedBoundary = null;
      if (!boundary || boundary.blocked) return;
      const isCurrent = () => active
        && !latest.current.blocked
        && boundary.generation === generation.current
        && boundary.draftRevision === useCartStore.getState().draftRevision
        && !useCheckoutRecoveryStore.getState().pending;
      if (!isCurrent()) return;
      const candidateRevision = selectionRevision.current;
      const publishStatus = (status: BarcodeLookupStatus) => {
        if (isCurrent() && candidateRevision === selectionRevision.current) latest.current.onStatus?.(status);
      };
      const canPublish = async () => {
        while (isCurrent() && pausedSequence.current !== null) {
          await new Promise<void>((resume) => waiters.current.add(resume));
        }
        return isCurrent();
      };

      const applyMatchedProduct = (matched: PosProduct) => {
        if (!isCurrent()) return;
        const current = latest.current;
        const existing = useCartStore.getState().items.find((item) => item.product.id === matched.id);
        if (matched.stockQuantity <= 0 || (existing && existing.quantity >= matched.stockQuantity)) {
          publishStatus({ kind: 'found', message: `已找到 ${matched.name}，但庫存不足，未加入購物車` });
          current.showToast({ type: 'warning', message: `庫存不足：${matched.name}` });
          return;
        }
        current.addItem(matched);
        publishStatus({ kind: 'found', message: `已找到 ${matched.name}` });
        current.showToast({
          type: 'success',
          message: existing ? `數量 +1：${matched.name}` : `已加入 ${matched.name}`,
        });
        current.setSearchQuery('');
        current.searchRef.current?.focus();
      };

      const offerCandidates = (matches: PosProduct[]) => {
        if (!isCurrent() || candidateRevision !== selectionRevision.current) return;
        let consumed = false;
        const valid = () => !consumed && isCurrent()
          && candidateRevision === selectionRevision.current && pausedSequence.current === null;
        publishStatus({ kind: 'ambiguous', message: '找到多筆完全相符商品，請選擇商品或返回人工搜尋' });
        latest.current.onCandidates?.({
          code, products: matches,
          select: (productId) => {
            if (!valid()) return;
            const matched = matches.find((product) => product.id === productId);
            if (!matched) return;
            consumed = true;
            clearCandidates();
            latest.current.onStatus?.(null);
            applyMatchedProduct(matched);
          },
          dismiss: () => {
            if (!valid()) return;
            consumed = true;
            clearCandidates();
            latest.current.onStatus?.(null);
            latest.current.searchRef.current?.focus();
          },
        });
        latest.current.showToast({ type: 'info', message: '找到多筆完全相符商品，請手動選擇' });
      };

      const matches = exactMatches(latest.current.products, code);
      if (matches.length === 1) { applyMatchedProduct(matches[0]); return; }
      if (matches.length > 1) {
        offerCandidates(matches);
        return;
      }

      publishStatus({ kind: 'loading', message: `正在查詢 SKU ${code}…` });
      void (async () => {
        const response = await lookupProduct(code);
        if (!await canPublish()) return;
        const results = lookupProducts(response.data.data);
        const matches = exactMatches(results, code);
        if (results.length === 0) {
          publishStatus({ kind: 'not-found', message: `找不到 SKU ${code}，請檢查代碼或使用人工搜尋` });
          latest.current.showToast({ type: 'error', message: `找不到條碼 ${code}` });
        } else if (matches.length === 1) {
          applyMatchedProduct(matches[0]);
        } else if (matches.length > 1) {
          offerCandidates(matches);
        } else {
          publishStatus({ kind: 'not-found', message: '沒有完全相符的商品，請使用人工搜尋' });
          latest.current.showToast({ type: 'info', message: '沒有唯一完全相符商品，請手動選擇' });
        }
        latest.current.searchRef.current?.focus();
      })().catch(async (error: unknown) => {
        if (!await canPublish()) return;
        const forbidden = (error as { response?: { status?: number } } | null)?.response?.status === 403;
        const message = forbidden ? '沒有商品查詢權限，請聯絡管理員；草稿已保留'
          : '查詢商品失敗，請保留草稿並重新掃描或使用人工搜尋';
        publishStatus({ kind: forbidden ? 'forbidden' : 'error', message });
        latest.current.showToast({ type: 'error', message });
      });
    });
    return () => {
      active = false;
      mounted.current = false;
      invalidateLookups();
      stopBarcodeListener();
      unsubscribe();
      unsubscribeSequence();
      unsubscribeRecovery();
      unsubscribeCart();
    };
  }, [invalidateLookups, releaseWaiters, clearCandidates]);

  return handleSearchInput;
}
