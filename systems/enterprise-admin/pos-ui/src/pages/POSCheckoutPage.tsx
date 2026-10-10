import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { posApi, PosStaff, PosOrderSummary, PosCustomerLookup } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
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
import { useBarcodeScanner, type BarcodeCandidateSelection, type BarcodeLookupStatus } from '../hooks/useBarcodeScanner';
import { BarcodeCandidates } from '../components/BarcodeCandidates';
import { BarcodeLookupFeedback } from '../components/BarcodeLookupFeedback';
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
  const [barcodeCandidates, setBarcodeCandidates] = useState<BarcodeCandidateSelection | null>(null);
  const [barcodeLookupStatus, setBarcodeLookupStatus] = useState<BarcodeLookupStatus>(null);
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

  const { checkoutResult, setCheckoutResult, checkoutLoading, handleCheckout, queryCheckout, pending, recoveryError, contextReady, checkoutScope } = useCheckout({
    shiftId: shift.activeShift?.id,
    customerId: selectedCustomer?.id,
    onSuccess: (scope) => {
      setShowPaymentModal(false); setShowSplitModal(false);
      refreshInventory(scope);
    },
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

  const { data: products = [], isLoading: loadingProducts, isError: productsError, isFetching: fetchingProducts } = useQuery({
    queryKey: ['pos-products', checkoutScope, searchQuery, selectedCategory],
    queryFn: () =>
      posApi.getProducts(searchQuery || undefined, selectedCategory ?? undefined)
        .then((r) => r.data.data),
    staleTime: 30_000,
    enabled: !!checkoutScope,
  });

  const { data: categories = [], isLoading: loadingCategories, isSuccess: categoriesLoaded, isError: categoriesError, isRefetchError: categoriesRefetchError, error: categoriesFailure, isFetching: fetchingCategories, refetch: refetchCategories } = useQuery({
    queryKey: ['pos-categories', checkoutScope],
    queryFn: () => posApi.getCategories().then((r) => r.data.data),
    staleTime: 60_000,
    enabled: !!checkoutScope,
  });

  const { data: recommendations = [], isError: recommendationsError, isFetching: fetchingRecommendations } = useQuery({
    queryKey: ['pos-recommendations', checkoutScope, selectedCustomer?.id],
    queryFn: () => selectedCustomer
      ? posApi.getRecommendations(selectedCustomer.id).then((r) => r.data.data)
      : posApi.getHotRecommendations().then((r) => r.data.data),
    staleTime: 60_000,
    enabled: !!checkoutScope,
  });

  const { data: reorderForecast = [], isError: forecastError, isFetching: fetchingForecast } = useQuery({
    queryKey: ['pos-reorder-forecast', checkoutScope],
    queryFn: () => posApi.getReorderForecast(8).then((r) => r.data.data),
    staleTime: 60_000,
    retry: false,
    enabled: !!checkoutScope,
  });

  function refreshInventory(scope: string, refetchType: 'active' | 'none' = 'active') {
    // The authenticated tenant/cashier scope covers every search/category variant.
    // Refetch failures stay in query state; they cannot undo a confirmed payment.
    for (const key of ['pos-products', 'pos-recommendations', 'pos-reorder-forecast', 'pos-today-orders']) {
      void queryClient.invalidateQueries({ queryKey: [key, scope], refetchType });
    }
  }

  const scannerBlocked = !contextReady || !shift.activeShift || showStaffModal || showPaymentModal
    || showSplitModal || showOrderLookup || showShiftReport || !!checkoutResult
    || !!shift.showCloseShift || !!adminPinPending || !!refundTarget;
  const handleScannerSearchInput = useBarcodeScanner(products, searchRef, setSearchQuery, addItem, showToast, setBarcodeCandidates, {
    blocked: scannerBlocked,
    onStatus: setBarcodeLookupStatus,
  });

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
    const scope = checkoutScope;
    if (!scope) return;
    setRefundLoading(true);
    try {
      await posApi.refundOrder(orderId, reason);
      const sameScope = useCheckoutRecoveryStore.getState().scope === scope;
      // A late refund must not fetch the previous tenant using a new login.
      refreshInventory(scope, sameScope ? 'active' : 'none');
      if (!sameScope) return;
      setRefundTarget(null);
      setShowOrderLookup(false);
      showToast({ type: 'success', message: '退款已登記，庫存不變' });
    } catch (err: unknown) {
      if (useCheckoutRecoveryStore.getState().scope !== scope) return;
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      showToast({ type: 'error', message: msg ?? '退款登記失敗，請稍後再試' });
    } finally {
      setRefundLoading(false);
    }
  }

  const handleKeydown = useCallback((event: KeyboardEvent) => {
    if (pending) return;
    if (event.defaultPrevented) return;
    // Backstop modal ownership even if a removed control/backdrop lost focus.
    if ((showPaymentModal || showSplitModal || adminPinPending) && event.key !== 'Escape') {
      const nativeModalControl = event.target instanceof HTMLElement
        && event.target.closest('[role="dialog"]')
        && event.target.closest('input, textarea, select, button, a[href], [contenteditable="true"], [role="button"], [role="link"]')
        && !event.target.closest('[inert], [aria-hidden="true"]');
      // Return without cancelling native Enter activation inside the active modal.
      if (/^F[2-8]$/.test(event.key) || (event.key === 'Enter' && !nativeModalControl)) event.preventDefault();
      return;
    }
    // Escape closes an open overlay even when its search/input owns text keys.
    if (event.key === 'Escape') {
      if (adminPinPending || checkoutLoading) return;
      setShowStaffModal(false);
      setShowPaymentModal(false);
      setShowSplitModal(false);
      setShowOrderLookup(false);
      return;
    }
    // Native controls own Enter/Space (including candidate selection and cancel).
    // Do not turn their keyboard activation into a page-level checkout shortcut.
    if (event.target instanceof HTMLElement) {
      if (event.target.isContentEditable || event.target.closest('input, textarea, [contenteditable="true"]')) return;
      const activationKey = event.key === 'Enter' || event.key === ' ';
      if (activationKey && event.target.closest('select, button, a[href], [role="button"], [role="link"]')) return;
    }

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
    }
  }, [showPaymentModal, showStaffModal, showSplitModal, showToast, checkoutResult, shift.activeShift, pending, adminPinPending, checkoutLoading]);

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
      <div className="pos-topbar-container">
      <div className="pos-topbar" role="region" aria-label="收銀工具列" aria-describedby="pos-topbar-scroll-hint" tabIndex={0}>
        <div className="pos-brand">
          <img className="pos-brand-mark" src={`${import.meta.env.BASE_URL}brand/flow-capsule-v1/mark-light.svg`} alt="" width={32} height={32} />
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
            handleScannerSearchInput(event.nativeEvent);
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
      <p id="pos-topbar-scroll-hint" className="pos-topbar-scroll-hint">↔ 左右滑動工具列；Tab 切換，聚焦後用方向鍵捲動。</p>
      </div>

      <div className="pos-body">
        <div className="pos-product-area">
          {(productsError || recommendationsError || forecastError) && (
            <div role="alert" style={{ padding: 12, color: 'var(--danger)' }}>
              商品或庫存資料更新失敗，顯示資訊可能已過期。請重新整理後確認。
              <button type="button" onClick={() => checkoutScope && refreshInventory(checkoutScope)}>
                重新整理庫存
              </button>
            </div>
          )}
          {(fetchingProducts || fetchingRecommendations || fetchingForecast) && (
            <div role="status" style={{ padding: 12, color: 'var(--text-muted)' }}>商品與庫存更新中...</div>
          )}
          <CategoryNav categories={categories} selectedId={selectedCategory} onSelect={setSelectedCategory} />
          {loadingCategories && <div role="status" className="pos-category-status">分類載入中...</div>}
          {categoriesError && (
            <div role="alert" className="pos-category-status">
              {isAxiosError(categoriesFailure) && categoriesFailure.response?.status === 403
                ? '沒有讀取商品分類的權限，請聯絡管理員確認 POS 權限。'
                : '分類載入失敗。仍可使用全部商品與搜尋。'}
              {categoriesRefetchError && '分類資訊可能已過期。'}
              <button type="button" className="pos-category-btn" disabled={fetchingCategories} onClick={() => void refetchCategories()}>
                重新載入分類
              </button>
            </div>
          )}
          {categoriesLoaded && categories.length === 0 && (
            <div role="status" className="pos-category-status">尚無商品分類，可使用全部商品與搜尋。</div>
          )}
          <BarcodeLookupFeedback status={barcodeLookupStatus} />
          <BarcodeCandidates selection={barcodeCandidates} />
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
          suspended={!!adminPinPending}
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
      {showOrderLookup && checkoutScope && (
        <OrderLookupModal
          checkoutScope={checkoutScope}
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
