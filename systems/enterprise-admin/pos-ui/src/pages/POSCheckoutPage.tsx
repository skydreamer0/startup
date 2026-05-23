import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { posApi, PosStaff, PosOrderSummary, PosCustomerLookup } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import CategoryNav from '../components/CategoryNav';
import ProductGrid from '../components/ProductGrid';
import CartPanel from '../components/CartPanel';
import StaffSwitchModal from '../components/StaffSwitchModal';
import PaymentModal from '../components/PaymentModal';
import SplitPaymentModal, { PaymentEntry } from '../components/SplitPaymentModal';
import ReceiptModal from '../components/ReceiptModal';
import PosToast, { PosToastMessage } from '../components/PosToast';
import AdminPinModal from '../components/AdminPinModal';
import HoldOrderBar from '../components/HoldOrderBar';
import OrderLookupModal from '../components/OrderLookupModal';
import RefundModal from '../components/RefundModal';
import ShiftReportModal from '../components/ShiftReportModal';
import { printReceipt, openCashDrawer } from '../services/receiptService';
import { getPending, markSynced } from '../services/offlineQueue';
import OfflineStatus from '../components/OfflineStatus';
import PrinterStatus from '../components/PrinterStatus';
import { useShift } from '../hooks/useShift';
import { useCheckout } from '../hooks/useCheckout';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useCustomerDisplay, openCustomerDisplay } from '../hooks/useCustomerDisplay';
import ShiftOpenScreen from './ShiftOpenScreen';
import CloseShiftDialog from '../components/CloseShiftDialog';
import CustomerLookupPanel from '../components/CustomerLookupPanel';
import RecommendationChips from '../components/RecommendationChips';
import ReorderForecastBadge from '../components/ReorderForecastBadge';

// Discount thresholds that require admin PIN authorisation
const ITEM_DISCOUNT_PIN_THRESHOLD = 20;
const ORDER_DISCOUNT_PIN_THRESHOLD = 500;

export default function POSCheckoutPage() {
  const [staffList, setStaffList] = useState<PosStaff[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showOrderLookup, setShowOrderLookup] = useState(false);
  const [showShiftReport, setShowShiftReport] = useState(false);
  const [refundTarget, setRefundTarget] = useState<PosOrderSummary | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomerLookup | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [toast, setToast] = useState<PosToastMessage | null>(null);
  const [adminPinPending, setAdminPinPending] = useState<null | { action: 'checkout' | 'split'; splitPayments?: PaymentEntry[] }>(null);
  const [managerPin, setManagerPin] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { items, orderDiscountAmount } = useCartStore();
  const hasHighDiscount = items.some((i) => i.discountRate >= ITEM_DISCOUNT_PIN_THRESHOLD) || orderDiscountAmount >= ORDER_DISCOUNT_PIN_THRESHOLD;

  const { addItem, setSalesStaff, currentSalesStaffId } = useCartStore();
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((nextToast: PosToastMessage) => {
    setToast(nextToast);
  }, []);

  const shift = useShift(showToast, setSalesStaff);

  const { checkoutResult, setCheckoutResult, checkoutLoading, handleCheckout } = useCheckout({
    shiftId: shift.activeShift?.id,
    customerId: selectedCustomer?.id,
    onSuccess: () => { setShowPaymentModal(false); setShowSplitModal(false); },
    showToast,
  });

  useCustomerDisplay();

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

  const { data: recommendations = [] } = useQuery({
    queryKey: ['pos-recommendations', selectedCustomer?.id],
    queryFn: () => selectedCustomer
      ? posApi.getRecommendations(selectedCustomer.id).then((r) => r.data.data)
      : posApi.getHotRecommendations().then((r) => r.data.data),
    staleTime: 60_000,
  });

  const { data: reorderForecast = [] } = useQuery({
    queryKey: ['pos-reorder-forecast'],
    queryFn: () => posApi.getReorderForecast(8).then((r) => r.data.data),
    staleTime: 60_000,
    retry: false,
  });

  useBarcodeScanner(products, searchRef, setSearchQuery, addItem, showToast);

  function handleAddRecommendation(productId: string) {
    const recommendation = recommendations.find((item) => item.productId === productId);
    if (!recommendation) return;
    addItem({
      id: recommendation.productId,
      name: recommendation.name,
      sku: recommendation.sku,
      retailPrice: recommendation.retailPrice,
      stockQuantity: recommendation.stockQuantity,
    });
    showToast({ type: 'success', message: `已加入推薦商品：${recommendation.name}` });
  }

  function requirePin(action: 'checkout' | 'split', splitPayments?: PaymentEntry[]) {
    if (!hasHighDiscount) {
      if (action === 'split') handleCheckout(splitPayments);
      else handleCheckout();
      return;
    }
    if (managerPin) {
      if (action === 'split') handleCheckout(splitPayments);
      else handleCheckout();
      return;
    }
    setAdminPinPending({ action, splitPayments });
  }

  function onPinConfirmed(pin: string) {
    setManagerPin(pin);
    setAdminPinPending(null);
    if (adminPinPending?.action === 'split') handleCheckout(adminPinPending.splitPayments);
    else handleCheckout();
  }

  async function handleRefundConfirm(orderId: string, reason: string) {
    setRefundLoading(true);
    try {
      await posApi.refundOrder(orderId, reason);
      queryClient.invalidateQueries({ queryKey: ['pos-today-orders'] });
      setRefundTarget(null);
      setShowOrderLookup(false);
      showToast({ type: 'success', message: '退貨完成，庫存已還原' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      showToast({ type: 'error', message: msg ?? '退貨失敗，請稍後再試' });
    } finally {
      setRefundLoading(false);
    }
  }

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
      case 'F4':
        event.preventDefault();
        useCartStore.getState().holdCurrentCart();
        showToast({ type: 'success', message: '已掛單' });
        break;
      case 'F5':
        event.preventDefault();
        showToast({ type: 'warning', message: '請使用清空購物車按鈕確認清空' });
        break;
      case 'F6':
        event.preventDefault();
        setShowStaffModal(true);
        break;
      case 'F7':
        event.preventDefault();
        setShowOrderLookup(true);
        break;
      case 'F8':
        event.preventDefault();
        if (shift.activeShift) setShowShiftReport(true);
        break;
      case 'Enter':
        event.preventDefault();
        if (!showStaffModal && !showPaymentModal && !showSplitModal && !checkoutResult && useCartStore.getState().items.length > 0) {
          setShowPaymentModal(true);
        }
        break;
      case 'Escape':
        setShowStaffModal(false);
        setShowPaymentModal(false);
        setShowSplitModal(false);
        setShowOrderLookup(false);
        break;
    }
  }, [showPaymentModal, showStaffModal, showSplitModal, showToast, checkoutResult, shift.activeShift]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handleKeydown]);

  async function handlePrint() {
    if (!checkoutResult) return;
    const response = await posApi.getReceipt(checkoutResult.id);
    await printReceipt(response.data.data.buffer);
    // Open cash drawer if payment was (or includes) CASH
    if (checkoutResult.paymentMethod === 'CASH') {
      await openCashDrawer();
    }
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
        <CustomerLookupPanel
          selectedCustomer={selectedCustomer}
          onSelect={setSelectedCustomer}
          onClear={() => setSelectedCustomer(null)}
          onFeedback={showToast}
        />
        <HoldOrderBar onFeedback={showToast} />
        <OfflineStatus onSync={handleSync} />
        <ReorderForecastBadge forecasts={reorderForecast} />
        <PrinterStatus />
        <button type="button" onClick={() => setShowOrderLookup(true)} title="訂單查詢 (F7)" style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
          📋 訂單 (F7)
        </button>
        <button type="button" onClick={() => setShowShiftReport(true)} title="班報表 (F8)" style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
          📊 報表 (F8)
        </button>
        <button type="button" onClick={openCustomerDisplay} title="開啟顧客顯示器" style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
          🖥 顧客
        </button>
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
          <div style={{ padding: recommendations.length > 0 ? '10px 12px 0' : 0 }}>
            <RecommendationChips recommendations={recommendations} onAdd={handleAddRecommendation} />
          </div>
          <CartPanel
            currentStaffName={currentStaffName}
            onCheckout={() => setShowPaymentModal(true)}
            onSplitCheckout={() => setShowSplitModal(true)}
            onSwitchStaff={() => setShowStaffModal(true)}
            onFeedback={showToast}
          />
        </div>
      </div>

      <div className="pos-statusbar">
        <span>F2: 搜尋</span><span>F3: 折扣</span><span>F4: 掛單</span><span>F5: 清空確認</span><span>F6: 切換人員</span><span>F7: 訂單查詢</span><span>F8: 班報表</span><span>Enter: 結帳</span>
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
        <PaymentModal
          onConfirm={() => requirePin('checkout')}
          onClose={() => setShowPaymentModal(false)}
          loading={checkoutLoading}
          salesStaffName={currentStaffName}
          hasHighDiscount={hasHighDiscount}
          pinAuthorized={!!managerPin}
        />
      )}
      {showSplitModal && (
        <SplitPaymentModal
          onConfirm={(payments) => requirePin('split', payments)}
          onClose={() => setShowSplitModal(false)}
          loading={checkoutLoading}
          salesStaffName={currentStaffName}
        />
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
      {adminPinPending && (
        <AdminPinModal
          reason={`折扣超過授權閾值（商品 ≥${ITEM_DISCOUNT_PIN_THRESHOLD}% 或整筆 ≥$${ORDER_DISCOUNT_PIN_THRESHOLD}），請輸入管理員 PIN`}
          onConfirm={onPinConfirmed}
          onClose={() => setAdminPinPending(null)}
        />
      )}
      {showOrderLookup && (
        <OrderLookupModal
          shiftId={shift.activeShift?.id}
          onRefund={(order) => { setRefundTarget(order); setShowOrderLookup(false); }}
          onClose={() => setShowOrderLookup(false)}
        />
      )}
      {refundTarget && (
        <RefundModal
          order={refundTarget}
          onConfirm={handleRefundConfirm}
          onClose={() => setRefundTarget(null)}
          loading={refundLoading}
        />
      )}
      {showShiftReport && shift.activeShift && (
        <ShiftReportModal
          shiftId={shift.activeShift.id}
          onClose={() => setShowShiftReport(false)}
        />
      )}
    </div>
  );
}
