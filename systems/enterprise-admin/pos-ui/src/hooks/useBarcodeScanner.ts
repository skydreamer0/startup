import { MutableRefObject, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { posApi, PosProduct } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import { startBarcodeListener, stopBarcodeListener, onBarcode } from '../services/barcodeService';
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
  const latest = useRef({ products, searchRef, setSearchQuery, addItem, showToast });
  useLayoutEffect(() => {
    latest.current = { products, searchRef, setSearchQuery, addItem, showToast };
  }, [products, searchRef, setSearchQuery, addItem, showToast]);

  // Only an explicit search/draft/checkout boundary invalidates scan intents.
  // Another scan or a product-query rerender must not swallow a valid earlier scan.
  const invalidateLookups = useCallback(() => { generation.current += 1; }, []);

  useEffect(() => {
    let active = true;
    const unsubscribeRecovery = useCheckoutRecoveryStore.subscribe((next, previous) => {
      if (next.pending || next.scope !== previous.scope) invalidateLookups();
    });
    startBarcodeListener();
    const unsubscribe = onBarcode((code) => {
      if (useCheckoutRecoveryStore.getState().pending) return;
      const startedGeneration = generation.current;
      const draftRevision = useCartStore.getState().draftRevision;
      const isCurrent = () => active
        && startedGeneration === generation.current
        && draftRevision === useCartStore.getState().draftRevision
        && !useCheckoutRecoveryStore.getState().pending;

      const applyMatchedProduct = (matched: PosProduct) => {
        if (!isCurrent()) return;
        const current = latest.current;
        if (matched.stockQuantity === 0) {
          current.showToast({ type: 'warning', message: `庫存不足：${matched.name}` });
          return;
        }
        const alreadyInCart = useCartStore.getState().items.some((item) => item.product.id === matched.id);
        current.addItem(matched);
        current.showToast({
          type: 'success',
          message: alreadyInCart ? `數量 +1：${matched.name}` : `已加入 ${matched.name}`,
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
        if (!isCurrent()) return;
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
      })().catch(() => {
        if (isCurrent()) latest.current.showToast({ type: 'error', message: '查詢商品失敗，請保留草稿並重試' });
      });
    });
    return () => {
      active = false;
      stopBarcodeListener();
      unsubscribe();
      unsubscribeRecovery();
    };
  }, [invalidateLookups]);

  return invalidateLookups;
}
