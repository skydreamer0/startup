import { MutableRefObject, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { posApi, PosProduct } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import {
  startBarcodeListener, stopBarcodeListener, onBarcode, onBarcodeSequence, getBarcodeInputSequence,
} from '../services/barcodeService';
import { PosToastMessage } from '../components/PosToast';

function exactMatches(products: PosProduct[], code: string) {
  return products.filter((product) => product.sku === code || product.barcode === code);
}

export function useBarcodeScanner(
  products: PosProduct[],
  searchRef: MutableRefObject<HTMLInputElement | null>,
  setSearchQuery: (q: string) => void,
  addItem: (product: PosProduct) => void,
  showToast: (msg: PosToastMessage) => void,
) {
  const generation = useRef(0);
  const pausedSequence = useRef<number | null>(null);
  const waiters = useRef(new Set<() => void>());
  const latest = useRef({ products, searchRef, setSearchQuery, addItem, showToast });
  useLayoutEffect(() => {
    latest.current = { products, searchRef, setSearchQuery, addItem, showToast };
  }, [products, searchRef, setSearchQuery, addItem, showToast]);

  // Only an explicit search/draft/checkout boundary invalidates scan intents.
  // Another scan or a product-query rerender must not swallow a valid earlier scan.
  const releaseWaiters = useCallback(() => {
    pausedSequence.current = null;
    waiters.current.forEach((resume) => resume());
    waiters.current.clear();
  }, []);
  const invalidateLookups = useCallback(() => {
    generation.current += 1;
    releaseWaiters();
  }, [releaseWaiters]);
  const handleSearchInput = useCallback((event?: Event) => {
    const sequenceId = event ? getBarcodeInputSequence(event) : null;
    if (sequenceId !== null) pausedSequence.current = sequenceId;
    else invalidateLookups();
  }, [invalidateLookups]);

  useEffect(() => {
    let active = true;
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
        startedBoundary = {
          generation: generation.current,
          draftRevision: useCartStore.getState().draftRevision,
          blocked: !!useCheckoutRecoveryStore.getState().pending,
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
        && boundary.generation === generation.current
        && boundary.draftRevision === useCartStore.getState().draftRevision
        && !useCheckoutRecoveryStore.getState().pending;
      if (!isCurrent()) return;
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
          current.showToast({ type: 'warning', message: `庫存不足：${matched.name}` });
          return;
        }
        current.addItem(matched);
        current.showToast({
          type: 'success',
          message: existing ? `數量 +1：${matched.name}` : `已加入 ${matched.name}`,
        });
        current.setSearchQuery('');
        current.searchRef.current?.focus();
      };

      const matches = exactMatches(latest.current.products, code);
      if (matches.length === 1) { applyMatchedProduct(matches[0]); return; }
      if (matches.length > 1) {
        latest.current.showToast({ type: 'info', message: '找到多筆完全相符商品，請手動選擇' });
        return;
      }

      void (async () => {
        const response = await posApi.getProducts(code);
        if (!await canPublish()) return;
        const results = response.data.data;
        const matches = exactMatches(results, code);
        if (results.length === 0) {
          latest.current.showToast({ type: 'error', message: `找不到條碼 ${code}` });
        } else if (matches.length === 1) {
          applyMatchedProduct(matches[0]);
        } else {
          latest.current.showToast({ type: 'info', message: '沒有唯一完全相符商品，請手動選擇' });
        }
        latest.current.searchRef.current?.focus();
      })().catch(async () => {
        if (await canPublish()) latest.current.showToast({ type: 'error', message: '查詢商品失敗，請保留草稿並重試' });
      });
    });
    return () => {
      active = false;
      invalidateLookups();
      stopBarcodeListener();
      unsubscribe();
      unsubscribeSequence();
      unsubscribeRecovery();
      unsubscribeCart();
    };
  }, [invalidateLookups, releaseWaiters]);

  return handleSearchInput;
}
