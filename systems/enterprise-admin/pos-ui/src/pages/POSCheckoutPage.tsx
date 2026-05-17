import { useCallback, useEffect, useRef, useState } from 'react';
import { posApi, PosProduct, PosStaff, ActiveShift, CheckoutResult } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import CategoryNav from '../components/CategoryNav';
import ProductGrid from '../components/ProductGrid';
import CartPanel from '../components/CartPanel';
import StaffSwitchModal from '../components/StaffSwitchModal';
import PaymentModal from '../components/PaymentModal';
import ReceiptModal from '../components/ReceiptModal';
import PosToast, { PosToastMessage } from '../components/PosToast';
import { startBarcodeListener, stopBarcodeListener, onBarcode } from '../services/barcodeService';
import { printReceipt } from '../services/receiptService';

function getCurrentUserId(): string | null {
  try {
    const token = localStorage.getItem('pos_accessToken');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

export default function POSCheckoutPage() {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [staffList, setStaffList] = useState<PosStaff[]>([]);
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [openingCash, setOpeningCash] = useState(0);
  const [shiftOpening, setShiftOpening] = useState(false);
  const [toast, setToast] = useState<PosToastMessage | null>(null);

  const { addItem, clearCart, setSalesStaff, currentSalesStaffId } = useCartStore();
  const searchRef = useRef<HTMLInputElement>(null);

  const currentStaff = staffList.find((staff) => staff.id === currentSalesStaffId);
  const currentStaffName = currentStaff?.fullName ?? activeShift?.staff.fullName ?? '未指定人員';

  const showToast = useCallback((nextToast: PosToastMessage) => {
    setToast(nextToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    posApi.getStaff().then((response) => setStaffList(response.data.data));
    posApi.getActiveShift().then((response) => {
      const shift = response.data.data;
      setActiveShift(shift);
      if (shift && !currentSalesStaffId) setSalesStaff(shift.staff.id);
    });
  }, [currentSalesStaffId, setSalesStaff]);

  useEffect(() => {
    setLoadingProducts(true);
    posApi.getProducts(searchQuery || undefined, selectedCategory ?? undefined)
      .then((response) => setProducts(response.data.data))
      .finally(() => setLoadingProducts(false));
  }, [searchQuery, selectedCategory]);

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
      if (matched) {
        applyMatchedProduct(matched);
        return;
      }

      void (async () => {
        const response = await posApi.getProducts(code);
        const results = response.data.data;

        if (results.length === 0) {
          showToast({ type: 'error', message: `找不到條碼 ${code}` });
        } else if (results.length === 1) {
          applyMatchedProduct(results[0]);
        } else {
          setProducts(results);
          showToast({ type: 'info', message: `找到 ${results.length} 筆商品，請選擇` });
        }

        searchRef.current?.focus();
      })();
    });
    return () => { stopBarcodeListener(); unsubscribe(); };
  }, [products, addItem, showToast]);

  const handleKeydown = useCallback((event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;

    switch (event.key) {
      case 'F2':
        event.preventDefault();
        searchRef.current?.focus();
        break;
      case 'F3':
        event.preventDefault();
        document.getElementById('order-discount')?.focus();
        break;
      case 'F5':
        event.preventDefault();
        showToast({ type: 'warning', message: '請使用清空購物車按鈕確認清空' });
        break;
      case 'F6':
        event.preventDefault();
        setShowStaffModal(true);
        break;
      case 'Enter':
        event.preventDefault();
        if (!showStaffModal && !showPaymentModal && !checkoutResult && useCartStore.getState().items.length > 0) {
          setShowPaymentModal(true);
        }
        break;
      case 'Escape':
        setShowStaffModal(false);
        setShowPaymentModal(false);
        break;
    }
  }, [showPaymentModal, showStaffModal, showToast, checkoutResult]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handleKeydown]);

  async function handleCheckout() {
    const { items, orderDiscountAmount, orderDiscountNote, paymentMethod, currentSalesStaffId: staffId } = useCartStore.getState();
    if (!activeShift) {
      showToast({ type: 'error', message: '目前沒有開啟班別，請先開班再結帳' });
      return;
    }

    setCheckoutLoading(true);
    try {
      const response = await posApi.checkout({
        cartItems: items.map((item) => ({ productId: item.product.id, quantity: item.quantity, discountRate: item.discountRate })),
        paymentMethod,
        orderDiscountAmount,
        orderDiscountNote: orderDiscountNote || undefined,
        shiftId: activeShift.id,
        salesStaffId: staffId ?? undefined,
      });
      clearCart();
      setShowPaymentModal(false);
      setCheckoutResult(response.data.data);
      showToast({ type: 'success', message: '結帳完成' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      showToast({ type: 'error', message: msg ?? '結帳失敗，請稍後再試' });
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleOpenShift() {
    const userId = getCurrentUserId();
    if (!userId) {
      showToast({ type: 'error', message: '找不到登入人員，請重新登入後再開班' });
      return;
    }

    setShiftOpening(true);
    try {
      const response = await posApi.openShift(userId, openingCash);
      const shift = response.data.data;
      setActiveShift(shift);
      setSalesStaff(shift.staff.id);
      showToast({ type: 'success', message: '班別已開啟' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      showToast({ type: 'error', message: msg ?? '開班失敗，請稍後再試' });
    } finally {
      setShiftOpening(false);
    }
  }

  async function handlePrint() {
    if (!checkoutResult) return;
    const response = await posApi.getReceipt(checkoutResult.id);
    await printReceipt(response.data.data.buffer);
    showToast({ type: 'success', message: '收據已送出列印' });
  }

  const categories = Array.from(
    new Map(products.filter((product) => product.category).map((product) => [product.category!.id, product.category!])).values(),
  );

  if (!activeShift) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)', fontFamily: 'Inter, sans-serif' }}>
        <PosToast toast={toast} onDismiss={() => setToast(null)} />
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 48, width: 380, boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>開班</div>
          <h2 style={{ margin: '0 0 8px' }}>目前沒有開啟班別</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 28px' }}>請先輸入開班金額，再開始 POS 結帳作業。</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>開班金額</label>
            <input
              type="number"
              min={0}
              value={openingCash}
              onChange={(event) => setOpeningCash(Number(event.target.value))}
              style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 14 }}
            />
            <span style={{ fontSize: 13 }}>元</span>
          </div>
          <button
            type="button"
            onClick={handleOpenShift}
            disabled={shiftOpening}
            style={{ width: '100%', padding: '12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 16, fontWeight: 700, cursor: shiftOpening ? 'not-allowed' : 'pointer', opacity: shiftOpening ? 0.7 : 1 }}
          >
            {shiftOpening ? '開班中...' : '開始開班'}
          </button>
          <button
            type="button"
            onClick={() => { localStorage.removeItem('pos_accessToken'); window.location.href = '/login'; }}
            style={{ marginTop: 12, width: '100%', padding: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
          >
            登出
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-app)', fontFamily: 'Inter, sans-serif' }}>
      <PosToast toast={toast} onDismiss={() => setToast(null)} />
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', gap: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>PharmaSaaS POS</span>
        <span style={{ fontSize: 12, color: 'var(--success)' }}>班別已開啟</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setShowStaffModal(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>
          人員 {currentStaffName} (F6)
        </button>
      </div>

      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <input
          ref={searchRef}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜尋商品名稱、條碼或 SKU... (F2)"
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 110, flexShrink: 0 }}>
          <CategoryNav categories={categories} selectedId={selectedCategory} onSelect={setSelectedCategory} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ProductGrid products={products} loading={loadingProducts} />
        </div>
        <div style={{ width: 300, flexShrink: 0 }}>
          <CartPanel
            currentStaffName={currentStaffName}
            onCheckout={() => setShowPaymentModal(true)}
            onSwitchStaff={() => setShowStaffModal(true)}
            onFeedback={showToast}
          />
        </div>
      </div>

      <div style={{ padding: '6px 16px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
        <span>F2: 搜尋</span><span>F3: 折扣</span><span>F5: 清空確認</span><span>F6: 切換人員</span><span>Enter: 結帳</span>
      </div>

      {showStaffModal && (
        <StaffSwitchModal
          staffList={staffList}
          currentStaffId={currentSalesStaffId}
          onSelect={(id) => { setSalesStaff(id); setShowStaffModal(false); }}
          onClose={() => setShowStaffModal(false)}
        />
      )}
      {showPaymentModal && (
        <PaymentModal onConfirm={handleCheckout} onClose={() => setShowPaymentModal(false)} loading={checkoutLoading} salesStaffName={currentStaffName} />
      )}
      {checkoutResult && (
        <ReceiptModal
          order={checkoutResult}
          onPrint={handlePrint}
          onClose={() => setCheckoutResult(null)}
        />
      )}
    </div>
  );
}
