import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { posApi, PosStaff } from '../api/pos';
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
import { useCheckout } from '../hooks/useCheckout';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import ShiftOpenScreen from './ShiftOpenScreen';
import CloseShiftDialog from '../components/CloseShiftDialog';

export default function POSCheckoutPage() {
  const [staffList, setStaffList] = useState<PosStaff[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [toast, setToast] = useState<PosToastMessage | null>(null);

  const { addItem, setSalesStaff, currentSalesStaffId } = useCartStore();
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((nextToast: PosToastMessage) => {
    setToast(nextToast);
  }, []);

  const shift = useShift(showToast, setSalesStaff);

  const { checkoutResult, setCheckoutResult, checkoutLoading, handleCheckout } = useCheckout({
    shiftId: shift.activeShift?.id,
    onSuccess: () => setShowPaymentModal(false),
    showToast,
  });

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🌿</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.2 }}>PharmaSaaS POS</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>健康生活藥局</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px', background: 'var(--success-bg)', borderRadius: 'var(--radius-full)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>班別進行中</span>
        </div>
        <div style={{ flex: 1 }} />
        <input
          ref={searchRef}
          data-testid="product-search-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="🔍 搜尋商品名稱或 SKU... (F2)"
          style={{ width: 260, padding: '8px 16px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', fontSize: 13, background: 'var(--bg-app)', outline: 'none', color: 'var(--text-primary)' }}
        />
        <OfflineStatus onSync={handleSync} />
        <PrinterStatus />
        <button type="button" onClick={() => setShowStaffModal(true)} style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '6px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
          👤 {currentStaffName}
        </button>
        <button type="button" onClick={() => shift.setShowCloseShift(true)} style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 'var(--radius-full)', padding: '6px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
          交班
        </button>
      </div>

      <div className="pos-body">
        <div className="pos-product-area">
          <CategoryNav categories={categories} selectedId={selectedCategory} onSelect={setSelectedCategory} />
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
