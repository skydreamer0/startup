import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { posApi, PosStaff, CheckoutResult } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import CategoryNav from '../components/CategoryNav';
import ProductGrid from '../components/ProductGrid';
import CartPanel from '../components/CartPanel';
import StaffSwitchModal from '../components/StaffSwitchModal';
import PaymentModal from '../components/PaymentModal';
import ReceiptModal from '../components/ReceiptModal';
import PosToast, { PosToastMessage } from '../components/PosToast';
import { printReceipt } from '../services/receiptService';
import { getPending, markSynced } from '../services/offlineQueue';
import OfflineStatus from '../components/OfflineStatus';
import PrinterStatus from '../components/PrinterStatus';
import { useShift } from '../hooks/useShift';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import ShiftOpenScreen from './ShiftOpenScreen';
import CloseShiftDialog from '../components/CloseShiftDialog';

export default function POSCheckoutPage() {
  const [staffList, setStaffList] = useState<PosStaff[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [toast, setToast] = useState<PosToastMessage | null>(null);

  const { addItem, clearCart, setSalesStaff, currentSalesStaffId } = useCartStore();
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((nextToast: PosToastMessage) => {
    setToast(nextToast);
  }, []);

  const shift = useShift(showToast, setSalesStaff);

  const currentStaff = staffList.find((staff) => staff.id === currentSalesStaffId);
  const currentStaffName = currentStaff?.fullName ?? shift.activeShift?.staff.fullName ?? '未指定人員';

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    posApi.getStaff().then((response) => setStaffList(response.data.data));
  }, []);

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['pos-products', searchQuery, selectedCategory],
    queryFn: () =>
      posApi.getProducts(searchQuery || undefined, selectedCategory ?? undefined)
        .then((r) => r.data.data),
    staleTime: 30_000,
  });

  useBarcodeScanner(products, searchRef, setSearchQuery, addItem, showToast);

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
    if (!shift.activeShift) {
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
        shiftId: shift.activeShift.id,
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

  async function handlePrint() {
    if (!checkoutResult) return;
    const response = await posApi.getReceipt(checkoutResult.id);
    await printReceipt(response.data.data.buffer);
    showToast({ type: 'success', message: '收據已送出列印' });
  }

  async function handleSync() {
    const pending = await getPending();
    if (pending.length === 0) { showToast({ type: 'info', message: '沒有待同步的交易' }); return; }
    let ok = 0; let fail = 0;
    for (const tx of pending) {
      try { await posApi.checkout(tx.payload); await markSynced(tx.localId!); ok++; }
      catch { fail++; }
    }
    showToast({ type: fail === 0 ? 'success' : 'warning', message: fail === 0 ? `已同步 ${ok} 筆離線交易` : `同步完成：${ok} 成功，${fail} 失敗` });
  }

  const categories = Array.from(
    new Map(products.filter((product) => product.category).map((product) => [product.category!.id, product.category!])).values(),
  );

  if (!shift.activeShift) return (
    <ShiftOpenScreen
      openingCash={shift.openingCash}
      onOpeningCashChange={shift.setOpeningCash}
      onOpenShift={shift.handleOpenShift}
      shiftOpening={shift.shiftOpening}
      toast={toast}
      onDismissToast={() => setToast(null)}
    />
  );

  return (
    <div className="pos-shell">
      <PosToast toast={toast} onDismiss={() => setToast(null)} />
      <div className="pos-topbar">
        <span style={{ fontWeight: 700, fontSize: 15 }}>PharmaSaaS POS</span>
        <span style={{ fontSize: 12, color: 'var(--success)' }}>班別已開啟</span>
        <div style={{ flex: 1 }} />
        <OfflineStatus onSync={handleSync} />
        <PrinterStatus />
        <button type="button" onClick={() => setShowStaffModal(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>
          人員 {currentStaffName} (F6)
        </button>
        <button type="button" onClick={() => shift.setShowCloseShift(true)} style={{ background: 'none', border: '1px solid var(--danger)', borderRadius: 'var(--radius-xs)', padding: '4px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--danger)' }}>
          交班
        </button>
      </div>

      <div className="pos-searchbar">
        <input
          ref={searchRef}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜尋商品名稱、條碼或 SKU... (F2)"
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>

      <div className="pos-body">
        <div className="pos-category">
          <CategoryNav categories={categories} selectedId={selectedCategory} onSelect={setSelectedCategory} />
        </div>
        <div className="pos-product-area">
          <ProductGrid products={products} loading={loadingProducts} />
        </div>
        <div className="pos-cart">
          <CartPanel
            currentStaffName={currentStaffName}
            onCheckout={() => setShowPaymentModal(true)}
            onSwitchStaff={() => setShowStaffModal(true)}
            onFeedback={showToast}
          />
        </div>
      </div>

      <div className="pos-statusbar">
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
      {shift.showCloseShift && (
        <CloseShiftDialog
          closingCash={shift.closingCash}
          onClosingCashChange={shift.setClosingCash}
          onConfirm={shift.handleCloseShift}
          onCancel={() => shift.setShowCloseShift(false)}
          loading={shift.shiftClosing}
        />
      )}
    </div>
  );
}
