import { useCallback, useEffect, useRef, useState } from 'react';
import { posApi, PosProduct, PosStaff, ActiveShift, CheckoutResult } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import CategoryNav from '../components/CategoryNav';
import ProductGrid from '../components/ProductGrid';
import CartPanel from '../components/CartPanel';
import StaffSwitchModal from '../components/StaffSwitchModal';
import PaymentModal from '../components/PaymentModal';
import ReceiptModal from '../components/ReceiptModal';
import { startBarcodeListener, stopBarcodeListener, onBarcode } from '../services/barcodeService';
import { printReceipt } from '../services/receiptService';

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

  const { addItem, clearCart, setSalesStaff, currentSalesStaffId } = useCartStore();
  const searchRef = useRef<HTMLInputElement>(null);

  const currentStaff = staffList.find((s) => s.id === currentSalesStaffId);
  const currentStaffName = currentStaff?.fullName ?? activeShift?.staff.fullName ?? '未設定';

  useEffect(() => {
    posApi.getStaff().then((r) => setStaffList(r.data.data));
    posApi.getActiveShift().then((r) => {
      const shift = r.data.data;
      setActiveShift(shift);
      if (shift && !currentSalesStaffId) setSalesStaff(shift.staff.id);
    });
  }, []);

  useEffect(() => {
    setLoadingProducts(true);
    posApi.getProducts(searchQuery || undefined, selectedCategory ?? undefined)
      .then((r) => setProducts(r.data.data))
      .finally(() => setLoadingProducts(false));
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    startBarcodeListener();
    const unsub = onBarcode((code) => {
      setSearchQuery(code);
      const matched = products.find(
        (p) => p.sku === code || (p.barcode && p.barcode === code),
      );
      if (matched) addItem(matched);
    });
    return () => { stopBarcodeListener(); unsub(); };
  }, [products, addItem]);

  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case 'F2': e.preventDefault(); searchRef.current?.focus(); break;
      case 'F3': e.preventDefault(); document.getElementById('order-discount')?.focus(); break;
      case 'F5': e.preventDefault(); clearCart(); break;
      case 'F6': e.preventDefault(); setShowStaffModal(true); break;
      case 'Enter': e.preventDefault(); if (useCartStore.getState().items.length > 0) setShowPaymentModal(true); break;
      case 'Escape': setShowStaffModal(false); setShowPaymentModal(false); break;
    }
  }, [clearCart]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handleKeydown]);

  async function handleCheckout() {
    const { items, orderDiscountAmount, orderDiscountNote, paymentMethod, currentSalesStaffId: staffId } = useCartStore.getState();
    if (!activeShift) { alert('尚未開班，無法結帳'); return; }
    setCheckoutLoading(true);
    try {
      const res = await posApi.checkout({
        cartItems: items.map((i) => ({ productId: i.product.id, quantity: i.quantity, discountRate: i.discountRate })),
        paymentMethod,
        orderDiscountAmount,
        orderDiscountNote: orderDiscountNote || undefined,
        shiftId: activeShift.id,
        salesStaffId: staffId ?? undefined,
      });
      clearCart();
      setShowPaymentModal(false);
      setCheckoutResult(res.data.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      alert(msg ?? '結帳失敗，請重試');
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handlePrint() {
    if (!checkoutResult) return;
    try {
      const res = await posApi.getReceipt(checkoutResult.id);
      await printReceipt(res.data.data.buffer);
    } catch {
      alert('列印失敗');
    }
  }

  const categories = Array.from(
    new Map(products.filter((p) => p.category).map((p) => [p.category!.id, p.category!])).values(),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-app)', fontFamily: 'Inter, sans-serif' }}>
      {/* TopBar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', gap: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>PharmaSaaS POS</span>
        {activeShift
          ? <span style={{ fontSize: 12, color: 'var(--success)' }}>班別開啟中</span>
          : <span style={{ fontSize: 12, color: 'var(--danger)' }}>尚未開班</span>
        }
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowStaffModal(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>
          👤 {currentStaffName} ▾ F6
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <input
          ref={searchRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 掃描條碼 / 輸入品名或 SKU... (F2)"
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>

      {/* 3-column layout */}
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
          />
        </div>
      </div>

      {/* Shortcut bar */}
      <div style={{ padding: '6px 16px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
        <span>F2:搜尋</span><span>F3:折扣</span><span>F5:清空</span><span>F6:換人</span><span>Enter:結帳</span>
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
        <PaymentModal onConfirm={handleCheckout} onClose={() => setShowPaymentModal(false)} loading={checkoutLoading} />
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
