import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { posApi, PosStaff, PosOrderSummary, PosCustomerLookup } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import CategoryNav from '../components/CategoryNav';
import ProductGrid from '../components/ProductGrid';
import CartPanel from '../components/CartPanel';
import StaffSwitchModal from '../components/StaffSwitchModal';
import PaymentModal from '../components/PaymentModal';
import SplitPaymentModal from '../components/SplitPaymentModal';
import type { PaymentEntry } from '@pharmasaas/types';
import ReceiptModal from '../components/ReceiptModal';
import PosToast, { PosToastMessage } from '../components/PosToast';
import AdminPinModal from '../components/AdminPinModal';
import HoldOrderBar from '../components/HoldOrderBar';
import OrderLookupModal from '../components/OrderLookupModal';
import RefundModal from '../components/RefundModal';
import ShiftReportModal from '../components/ShiftReportModal';
import { printReceipt, openCashDrawer } from '../services/receiptService';
import { posOfflineLedger } from '../services/posOfflineLedger';
import OfflineStatus from '../components/OfflineStatus';
import PrinterStatus from '../components/PrinterStatus';
import { useShift } from '../hooks/useShift';
import { useCheckout } from '../hooks/useCheckout';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useCustomerDisplay, openCustomerDisplay } from '../hooks/useCustomerDisplay';
import ShiftOpenScreen from './ShiftOpenScreen';
import CloseShiftDialog from '../components/CloseShiftDialog';
import CheckoutRecovery from '../components/CheckoutRecovery';
import CustomerLookupPanel from '../components/CustomerLookupPanel';
import RecommendationChips from '../components/RecommendationChips';
import ReorderForecastBadge from '../components/ReorderForecastBadge';
import {
  buildCheckoutIntent,
  checkoutNeedsManagerApproval,
  MANAGER_APPROVAL_REASON,
  resolveCheckoutAuthorization,
  type CheckoutAction,
} from '../services/checkoutIntent';

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
  const {
    items,
    orderDiscountAmount,
    addItem,
    setSalesStaff,
    currentSalesStaffId,
  } = useCartStore();
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((nextToast: PosToastMessage) => {
    setToast(nextToast);
  }, []);

  const shift = useShift(showToast, setSalesStaff);
  const hasHighDiscount = checkoutNeedsManagerApproval(items, orderDiscountAmount);

  const { checkoutResult, setCheckoutResult, checkoutLoading, handleCheckout, queryCheckout, pending, recoveryError, contextReady } = useCheckout({
    shiftId: shift.activeShift?.id,
    customerId: selectedCustomer?.id,
    onSuccess: () => { setShowPaymentModal(false); setShowSplitModal(false); },
    showToast,
  });

  useEffect(() => {
    if (pending) { setShowPaymentModal(false); setShowSplitModal(false); }
  }, [pending]);

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

  const invalidateScannerLookups = useBarcodeScanner(products, searchRef, setSearchQuery, addItem, showToast);

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

  function requirePin(action: CheckoutAction, splitPayments?: PaymentEntry[]) {
    const cart = useCartStore.getState();
    const authorization = resolveCheckoutAuthorization({
      action,
      managerPin,
      intent: buildCheckoutIntent({
        items: cart.items,
        paymentMethod: cart.paymentMethod,
        splitPayments,
        orderDiscountAmount: cart.orderDiscountAmount,
        orderDiscountNote: cart.orderDiscountNote,
        customerId: selectedCustomer?.id,
        shiftId: shift.activeShift?.id,
        salesStaffId: cart.currentSalesStaffId,
      }),
    });

    if (authorization.status === 'approved') {
      handleCheckout(authorization.splitPayments);
      return;
    }

    setAdminPinPending({ action: authorization.action, splitPayments: authorization.splitPayments });
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
      showToast({ type: 'success', message: '退款已登記，庫存不變' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      showToast({ type: 'error', message: msg ?? '退款登記失敗，請稍後再試' });
    } finally {
      setRefundLoading(false);
    }
  }

  const handleKeydown = useCallback((event: KeyboardEvent) => {
    if (pending) return;
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
  }, [showPaymentModal, showStaffModal, showSplitModal, showToast, checkoutResult, shift.activeShift, pending]);

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
    const { attemptedCount, successCount, failureCount } = await posOfflineLedger.syncPendingCheckouts();
    if (attemptedCount === 0) {
      showToast({ type: 'info', message: '沒有待同步的交易' });
      return;
    }
    showToast({
      type: failureCount === 0 ? 'success' : 'warning',
      message: failureCount === 0
        ? `已同步 ${successCount} 筆離線交易`
        : `同步完成：${successCount} 成功，${failureCount} 失敗`,
    });
  }

  const categories = Array.from(
    new Map(products.filter((product) => product.category).map((product) => [product.category!.id, product.category!])).values(),
  );

  const recoveryPanel = <CheckoutRecovery pending={pending} error={recoveryError} loading={checkoutLoading}
    onQuery={queryCheckout} onRetry={() => handleCheckout()} />;

  if (!shift.activeShift) return (
    <>
      {recoveryPanel}
      {checkoutResult && <ReceiptModal order={checkoutResult} onPrint={handlePrint} onClose={() => setCheckoutResult(null)} />}
      <fieldset disabled={!!pending || !contextReady} style={{ border: 0, padding: 0, margin: 0 }}>
    <ShiftOpenScreen
      openingCash={shift.openingCash}
      onOpeningCashChange={shift.setOpeningCash}
      onOpenShift={shift.handleOpenShift}
      shiftOpening={shift.shiftOpening}
      toast={toast}
      onDismissToast={() => setToast(null)}
    />
      </fieldset>
    </>
  );

  return (
    <div className="pos-shell">
      <PosToast toast={toast} onDismiss={() => setToast(null)} />
      {recoveryPanel}
      <fieldset disabled={!!pending || !contextReady} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
      <div className="pos-topbar">
        <div className="pos-brand">
          <div className="pos-brand-mark">🌿</div>
          <div>
            <div className="pos-brand-title">PharmaSaaS POS</div>
            <div className="pos-brand-subtitle">健康生活藥局</div>
          </div>
        </div>
        <div className="pos-shift-pill">
          <span className="pos-shift-dot" />
          <span>班別進行中</span>
        </div>
        <div className="pos-search-spacer" />
        <input
          ref={searchRef}
          data-testid="product-search-input"
          value={searchQuery}
          onChange={(event) => {
            invalidateScannerLookups();
            setSearchQuery(event.target.value);
          }}
          placeholder="🔍 搜尋商品名稱或 SKU... (F2)"
          className="pos-search-input"
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
        <button type="button" onClick={() => setShowOrderLookup(true)} title="訂單查詢 (F7)" className="pos-topbar-action">
          📋 訂單 (F7)
        </button>
        <button type="button" onClick={() => setShowShiftReport(true)} title="班報表 (F8)" className="pos-topbar-action">
          📊 報表 (F8)
        </button>
        <button type="button" onClick={openCustomerDisplay} title="開啟顧客顯示器" className="pos-topbar-action">
          🖥 顧客
        </button>
        <button type="button" onClick={() => setShowStaffModal(true)} className="pos-topbar-action pos-topbar-action--wide">
          👤 {currentStaffName}
        </button>
        <button type="button" onClick={() => shift.setShowCloseShift(true)} className="pos-topbar-action pos-topbar-action--danger">
          交班
        </button>
      </div>

      <div className="pos-body">
        <div className="pos-product-area">
          <CategoryNav categories={categories} selectedId={selectedCategory} onSelect={setSelectedCategory} />
          <ProductGrid products={products} loading={loadingProducts} />
        </div>
        <div className="pos-cart">
          <div className="pos-recommendation-strip">
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
      </fieldset>

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
          reason={MANAGER_APPROVAL_REASON}
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
