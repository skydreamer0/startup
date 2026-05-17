import { MutableRefObject, useEffect } from 'react';
import { posApi, PosProduct } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import { startBarcodeListener, stopBarcodeListener, onBarcode } from '../services/barcodeService';
import { PosToastMessage } from '../components/PosToast';

export function useBarcodeScanner(
  products: PosProduct[],
  searchRef: MutableRefObject<HTMLInputElement | null>,
  setSearchQuery: (q: string) => void,
  addItem: (product: PosProduct) => void,
  showToast: (msg: PosToastMessage) => void,
) {
  useEffect(() => {
    startBarcodeListener();
    const unsubscribe = onBarcode((code) => {
      const applyMatchedProduct = (matched: PosProduct) => {
        if (matched.stockQuantity === 0) {
          showToast({ type: 'warning', message: `庫存不足：${matched.name}` });
          return;
        }
        const alreadyInCart = useCartStore.getState().items.some((i) => i.product.id === matched.id);
        addItem(matched);
        showToast({
          type: 'success',
          message: alreadyInCart ? `數量 +1：${matched.name}` : `已加入 ${matched.name}`,
        });
        setSearchQuery('');
        searchRef.current?.focus();
      };

      const matched = products.find(
        (product) => product.sku === code || (product.barcode && product.barcode === code),
      );
      if (matched) { applyMatchedProduct(matched); return; }

      void (async () => {
        const response = await posApi.getProducts(code);
        const results = response.data.data;
        if (results.length === 0) {
          showToast({ type: 'error', message: `找不到條碼 ${code}` });
        } else if (results.length === 1) {
          applyMatchedProduct(results[0]);
        } else {
          showToast({ type: 'info', message: `找到 ${results.length} 筆商品，請選擇` });
        }
        searchRef.current?.focus();
      })();
    });
    return () => { stopBarcodeListener(); unsubscribe(); };
  }, [products, addItem, showToast, setSearchQuery, searchRef]);
}
